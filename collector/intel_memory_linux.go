package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// FDInfo accounts memory per DRM client, not per file descriptor. A client can
// appear in several processes after fork/dup. Resident memory includes shared
// buffers, so the UI labels this as client-attributed RAM rather than VRAM.
type intelMemorySample struct {
	Timestamp int64  `json:"timestamp"`
	Used      uint64 `json:"used"`
	Shared    uint64 `json:"shared"`
	Available bool   `json:"available"`
}

func parseIntelFDInfo(data string, pci string) (string, uint64, uint64, bool) {
	fields := map[string]string{}
	for _, line := range strings.Split(data, "\n") {
		if k, v, ok := strings.Cut(line, ":"); ok {
			fields[k] = strings.TrimSpace(v)
		}
	}
	if fields["drm-driver"] != "i915" || fields["drm-pdev"] != pci || fields["drm-client-id"] == "" {
		return "", 0, 0, false
	}
	var used, shared uint64
	found := false
	for k, v := range fields {
		resident := strings.HasPrefix(k, "drm-resident-")
		sharing := strings.HasPrefix(k, "drm-shared-")
		if !resident && !sharing {
			continue
		}
		parts := strings.Fields(v)
		if len(parts) != 2 || parts[1] != "KiB" {
			return "", 0, 0, false
		}
		n, e := strconv.ParseUint(parts[0], 10, 64)
		if e != nil || n > ^uint64(0)/1024 {
			return "", 0, 0, false
		}
		if resident {
			used += n * 1024
			found = true
		} else {
			shared += n * 1024
		}
	}
	return fields["drm-client-id"], used, shared, found
}
func intelClients(path string) (map[string]bool, error) {
	b, e := os.ReadFile(path)
	if e != nil {
		return nil, e
	}
	lines := strings.Split(strings.TrimSpace(string(b)), "\n")
	if len(lines) == 0 || !strings.Contains(lines[0], "command") || !strings.HasSuffix(strings.TrimSpace(lines[0]), "id") {
		return nil, fmt.Errorf("unknown DRM clients header")
	}
	ids := map[string]bool{}
	for _, line := range lines[1:] {
		f := strings.Fields(line)
		if len(f) == 0 {
			continue
		}
		id := f[len(f)-1]
		if _, e := strconv.ParseUint(id, 10, 64); e != nil {
			return nil, e
		}
		ids[id] = true
	}
	return ids, nil
}
func probeIntelMemory(debugRoot, procRoot string) intelMemorySample {
	sample := intelMemorySample{Timestamp: time.Now().Unix()}
	cards, _ := filepath.Glob(filepath.Join(debugRoot, "[0-9]*"))
	for _, card := range cards {
		// Only primary DRM nodes; render/control aliases expose the same clients.
		minor, e := strconv.Atoi(filepath.Base(card))
		if e != nil || minor >= 64 {
			continue
		}
		b, e := os.ReadFile(filepath.Join(card, "name"))
		if e != nil || !strings.HasPrefix(string(b), "i915 ") {
			continue
		}
		pci := ""
		for _, f := range strings.Fields(string(b)) {
			if strings.HasPrefix(f, "dev=") {
				pci = strings.TrimPrefix(f, "dev=")
			}
		}
		if pci == "" {
			continue
		}
		ids, e := intelClients(filepath.Join(card, "clients"))
		if e != nil {
			return sample
		}
		seen := map[string]bool{}
		if len(ids) > 0 {
			files, _ := filepath.Glob(filepath.Join(procRoot, "[0-9]*", "fdinfo", "*"))
			for _, file := range files {
				b, e := os.ReadFile(file)
				if e != nil {
					continue
				}
				id, used, shared, ok := parseIntelFDInfo(string(b), pci)
				if ok && ids[id] && !seen[id] {
					sample.Used += used
					sample.Shared += shared
					seen[id] = true
				}
			}
		}
		after, e := intelClients(filepath.Join(card, "clients"))
		if e != nil || len(after) != len(ids) {
			return sample
		}
		for id := range ids {
			if !after[id] || !seen[id] {
				return sample
			}
		}
		sample.Available = true
		return sample
	}
	return sample
}
func runGPUProbe() bool {
	if len(os.Args) != 2 || os.Args[1] != "--intel-memory-probe" {
		return false
	}
	sample := probeIntelMemory("/sys/kernel/debug/dri", "/proc")
	if e := json.NewEncoder(os.Stdout).Encode(sample); e != nil {
		panic(e)
	}
	return true
}
func intelMemory() (any, string) {
	path := os.Getenv("METRICS_INTEL_MEMORY_FILE")
	if path == "" {
		return nil, ""
	}
	b, e := os.ReadFile(path)
	if e != nil {
		return nil, ""
	}
	var s intelMemorySample
	if json.Unmarshal(b, &s) != nil || !s.Available || time.Since(time.Unix(s.Timestamp, 0)) < 0 || time.Since(time.Unix(s.Timestamp, 0)) > 20*time.Second {
		return nil, ""
	}
	note := "GPU client RAM · excludes kernel buffers"
	if s.Shared > 0 {
		note = "GPU client RAM · shared buffers may be counted per client"
	}
	return float64(s.Used) / 1048576, note
}
