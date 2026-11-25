package main

import (
	"context"
	"fmt"
	"math"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
)

type processReading struct {
	PID     int      `json:"pid"`
	Name    string   `json:"name"`
	RSS     uint64   `json:"rss"`
	CPU     *float64 `json:"cpu"`
	started string
	seconds float64
}
type arcMemory struct {
	Size  uint64 `json:"size"`
	Limit uint64 `json:"limit"`
}
type processSnapshot struct {
	Available bool             `json:"available"`
	Timestamp float64          `json:"timestamp"`
	CPUReady  bool             `json:"cpu_ready"`
	Partial   bool             `json:"partial"`
	Memory    []processReading `json:"memory"`
	CPU       []processReading `json:"cpu"`
	ARC       *arcMemory       `json:"arc"`
}

var processesSnapshot *processSnapshot

// CPU is interval time divided by elapsed wall time and logical CPU count, like
// the host CPU chart. PID + start identity prevents spikes when a PID is reused.
func rankProcesses(current, previous []processReading, elapsed float64, cores int) processSnapshot {
	result := processSnapshot{Available: true, Memory: []processReading{}, CPU: []processReading{}}
	before := map[int]processReading{}
	for _, p := range previous {
		before[p.PID] = p
	}
	for _, p := range current {
		p.CPU = nil
		if old, ok := before[p.PID]; ok && old.started == p.started && elapsed > 0 && cores > 0 && p.seconds >= old.seconds {
			value := math.Min(100, (p.seconds-old.seconds)/elapsed/float64(cores)*100)
			p.CPU = &value
			result.CPUReady = true
			if value > 0 {
				result.CPU = append(result.CPU, p)
			}
		}
		if p.RSS > 0 {
			result.Memory = append(result.Memory, p)
		}
	}
	sort.Slice(result.Memory, func(i, j int) bool {
		a, b := result.Memory[i], result.Memory[j]
		if a.RSS == b.RSS {
			return a.PID < b.PID
		}
		return a.RSS > b.RSS
	})
	sort.Slice(result.CPU, func(i, j int) bool {
		a, b := result.CPU[i], result.CPU[j]
		if *a.CPU == *b.CPU {
			return a.PID < b.PID
		}
		return *a.CPU > *b.CPU
	})
	if len(result.Memory) > 3 {
		result.Memory = result.Memory[:3]
	}
	if len(result.CPU) > 3 {
		result.CPU = result.CPU[:3]
	}
	return result
}

func processLoop() {
	cores, err := cpu.Counts(true)
	if err != nil || cores < 1 {
		cores = runtime.NumCPU()
	}
	var previous []processReading
	var previousTime time.Time
	for {
		started := time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		readings, partial, err := readProcesses(ctx)
		cancel()
		finished := time.Now()
		result := processSnapshot{}
		if err == nil {
			result = rankProcesses(readings, previous, finished.Sub(previousTime).Seconds(), cores)
			result.Partial = partial
			result.ARC = readARCMemory()
			previous, previousTime = readings, finished
		} else {
			previous = nil
			previousTime = time.Time{}
		}
		result.Timestamp = float64(finished.UnixMilli()) / 1000
		mu.Lock()
		processesSnapshot = &result
		mu.Unlock()
		if delay := 5*time.Second - time.Since(started); delay > 0 {
			time.Sleep(delay)
		}
	}
}

func processName(name string) string {
	// Expose executable basenames only, never arguments or full filesystem paths.
	name = filepath.Base(strings.TrimSpace(name))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, name)
	runes := []rune(name)
	if len(runes) > 80 {
		name = string(runes[:80])
	}
	return name
}

func parseARC(data string) *arcMemory {
	values := map[string]uint64{}
	for _, line := range strings.Split(data, "\n") {
		fields := strings.Fields(line)
		if len(fields) != 3 || (fields[0] != "size" && fields[0] != "c_max") {
			continue
		}
		value, err := strconv.ParseUint(fields[2], 10, 64)
		if err != nil {
			return nil
		}
		values[fields[0]] = value
	}
	size, ok := values["size"]
	limit, hasLimit := values["c_max"]
	if !ok || !hasLimit || limit == 0 {
		return nil
	}
	return &arcMemory{Size: size, Limit: limit}
}

// ps uses mm:ss, hh:mm:ss or dd-hh:mm:ss with optional fractional seconds.
func parseCPUTime(value string) (float64, error) {
	total := 0.0
	if days, rest, ok := strings.Cut(value, "-"); ok {
		n, err := strconv.ParseUint(days, 10, 32)
		if err != nil {
			return 0, err
		}
		total = float64(n) * 86400
		value = rest
	}
	fields := strings.Split(value, ":")
	if len(fields) < 2 || len(fields) > 3 {
		return 0, fmt.Errorf("invalid CPU time")
	}
	clock := 0.0
	for i, field := range fields {
		n, err := strconv.ParseFloat(field, 64)
		if err != nil || n < 0 || math.IsNaN(n) || math.IsInf(n, 0) || (i > 0 && n >= 60) {
			return 0, fmt.Errorf("invalid CPU time")
		}
		clock = clock*60 + n
	}
	return total + clock, nil
}

func parsePS(data string) ([]processReading, bool) {
	result := []processReading{}
	partial := false
	for _, line := range strings.Split(strings.TrimSpace(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 9 {
			partial = true
			continue
		}
		pid, e1 := strconv.Atoi(fields[0])
		rss, e2 := strconv.ParseUint(fields[1], 10, 64)
		seconds, e3 := parseCPUTime(fields[2])
		if e1 != nil || e2 != nil || e3 != nil || pid <= 0 || rss > math.MaxUint64/1024 {
			partial = true
			continue
		}
		result = append(result, processReading{PID: pid, Name: processName(strings.Join(fields[8:], " ")), RSS: rss * 1024, seconds: seconds, started: strings.Join(fields[3:8], " ")})
	}
	return result, partial
}

func parseProcStat(data string, ticks float64, pageSize uint64) (processReading, error) {
	first, last := strings.Index(data, "("), strings.LastIndex(data, ")")
	if first < 1 || last < first || ticks <= 0 {
		return processReading{}, fmt.Errorf("invalid process stat")
	}
	pid, err := strconv.Atoi(strings.TrimSpace(data[:first]))
	if err != nil || pid <= 0 {
		return processReading{}, fmt.Errorf("invalid PID")
	}
	fields := strings.Fields(data[last+1:])
	if len(fields) < 22 {
		return processReading{}, fmt.Errorf("short process stat")
	}
	user, e1 := strconv.ParseUint(fields[11], 10, 64)
	system, e2 := strconv.ParseUint(fields[12], 10, 64)
	rss, e3 := strconv.ParseInt(fields[21], 10, 64)
	_, e4 := strconv.ParseUint(fields[19], 10, 64)
	if e1 != nil || e2 != nil || e3 != nil || e4 != nil || rss < 0 {
		return processReading{}, fmt.Errorf("invalid process counters")
	}
	return processReading{PID: pid, Name: processName(data[first+1 : last]), RSS: uint64(rss) * pageSize, seconds: (float64(user) + float64(system)) / ticks, started: fields[19]}, nil
}
