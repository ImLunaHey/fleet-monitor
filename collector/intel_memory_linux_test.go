package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestIntelMemoryProbe(t *testing.T) {
	root := t.TempDir()
	debug := filepath.Join(root, "dri")
	proc := filepath.Join(root, "proc")
	put := func(path, body string) {
		t.Helper()
		if e := os.MkdirAll(filepath.Dir(path), 0755); e != nil {
			t.Fatal(e)
		}
		if e := os.WriteFile(path, []byte(body), 0644); e != nil {
			t.Fatal(e)
		}
	}
	header := "command tgid dev master a uid magic name id\n"
	put(filepath.Join(debug, "0", "name"), "i915 dev=0000:00:02.0 unique=0000:00:02.0")
	put(filepath.Join(debug, "0", "clients"), header)
	if s := probeIntelMemory(debug, proc); !s.Available || s.Used != 0 {
		t.Fatalf("idle must be a known zero: %+v", s)
	}
	put(filepath.Join(debug, "0", "clients"), header+"renderer 1 0 n y 1000 0 renderer 7\n")
	if s := probeIntelMemory(debug, proc); s.Available {
		t.Fatal("unreadable active clients must stay unknown")
	}
	fd := "drm-driver: i915\ndrm-pdev: 0000:00:02.0\ndrm-client-id: 7\ndrm-resident-system0: 2048 KiB\ndrm-shared-system0: 1024 KiB\n"
	put(filepath.Join(proc, "1", "fdinfo", "3"), fd)
	put(filepath.Join(proc, "2", "fdinfo", "5"), fd)
	if s := probeIntelMemory(debug, proc); !s.Available || s.Used != 2097152 || s.Shared != 1048576 {
		t.Fatalf("must deduplicate duplicated client FDs: %+v", s)
	}
	if _, _, _, ok := parseIntelFDInfo(fd, "0000:01:00.0"); ok {
		t.Fatal("must not count another GPU")
	}
	for _, bad := range []string{"drm-driver: i915\ndrm-pdev: 0000:00:02.0\ndrm-client-id: 7", fd + "drm-resident-system0: junk KiB\n", fd + "drm-resident-system0: 1 GB\n"} {
		if _, _, _, ok := parseIntelFDInfo(bad, "0000:00:02.0"); ok {
			t.Fatal("invalid counters must stay unknown")
		}
	}
}
func TestIntelMemoryFreshness(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sample.json")
	t.Setenv("METRICS_INTEL_MEMORY_FILE", path)
	for _, tc := range []struct {
		age       int64
		available bool
		want      bool
	}{{0, true, true}, {30, true, false}, {-60, true, false}, {0, false, false}} {
		b, _ := json.Marshal(intelMemorySample{Timestamp: time.Now().Unix() - tc.age, Used: 1048576, Available: tc.available})
		if e := os.WriteFile(path, b, 0644); e != nil {
			t.Fatal(e)
		}
		used, _ := intelMemory()
		if (used != nil) != tc.want {
			t.Fatalf("sample %+v got %v", tc, used)
		}
	}
}
