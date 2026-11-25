package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestProcessRanking(t *testing.T) {
	old := []processReading{{PID: 1, started: "a", seconds: 10}, {PID: 2, started: "old", seconds: 100}, {PID: 3, started: "c", seconds: 20}, {PID: 4, started: "d", seconds: 10}, {PID: 5, started: "e", seconds: 0}}
	current := []processReading{{PID: 1, Name: "big", started: "a", seconds: 18, RSS: 600}, {PID: 2, started: "new", seconds: 150, RSS: 500}, {PID: 3, started: "c", seconds: 19, RSS: 400}, {PID: 4, started: "d", seconds: 11, RSS: 300}, {PID: 5, started: "e", seconds: 1, RSS: 200}, {PID: 6, started: "f", seconds: 80, RSS: 100}}
	got := rankProcesses(current, old, 2, 4)
	if !got.CPUReady || len(got.Memory) != 3 || len(got.CPU) != 3 {
		t.Fatalf("wrong ranking: %+v", got)
	}
	if got.Memory[0].PID != 1 || *got.CPU[0].CPU != 100 || got.CPU[1].PID != 4 || *got.CPU[1].CPU != 12.5 || got.CPU[2].PID != 5 {
		t.Fatalf("wrong interval/normalization: %+v", got)
	}
	if got.Memory[1].CPU != nil || got.Memory[2].CPU != nil {
		t.Fatal("PID reuse or reset counters reported as CPU")
	}
	if rankProcesses(current, nil, 2, 4).CPUReady {
		t.Fatal("first sample needs a baseline")
	}
	if rankProcesses(current, old, 0, 4).CPUReady || rankProcesses(current, old, 2, 0).CPUReady {
		t.Fatal("invalid denominator accepted")
	}
	idle := rankProcesses(old, old, 2, 4)
	if !idle.CPUReady || len(idle.CPU) != 0 {
		t.Fatal("idle and warming up must differ")
	}
	equal := rankProcesses([]processReading{{PID: 8, RSS: 1}, {PID: 7, RSS: 1}}, nil, 2, 4)
	if equal.Memory[0].PID != 7 {
		t.Fatal("unstable ties")
	}
}
func TestPSParsing(t *testing.T) {
	data := " 42 2048 1-02:03:04.50 Mon Nov 23 12:34:56 2026 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n43 0 0:00.00 Mon Nov 23 12:34:56 2026 /sbin/launchd"
	got, partial := parsePS(data)
	if partial || len(got) != 2 || got[0].Name != "Google Chrome" || got[0].RSS != 2097152 || got[0].seconds != 93784.5 {
		t.Fatalf("bad ps parsing: %+v partial=%v", got, partial)
	}
	payload, _ := json.Marshal(got)
	if strings.Contains(string(payload), "/Applications") || strings.Contains(string(payload), "started") || strings.Contains(string(payload), "seconds") {
		t.Fatal("exposed private collector fields")
	}
	for _, bad := range []string{"", "garbage", "0 1 0:00 Mon Nov 23 12:34:56 2026 name", "4 bad 0:00 Mon Nov 23 12:34:56 2026 name", "4 1 NaN Mon Nov 23 12:34:56 2026 name", "4 18446744073709551615 0:00 Mon Nov 23 12:34:56 2026 name"} {
		if got, partial := parsePS(bad); len(got) != 0 || !partial {
			t.Errorf("accepted %q", bad)
		}
	}
}
func TestCPUTime(t *testing.T) {
	for input, want := range map[string]float64{"12:34.5": 754.5, "1:02:03": 3723, "2-00:00:00": 172800} {
		got, e := parseCPUTime(input)
		if e != nil || got != want {
			t.Errorf("%s: %v %v", input, got, e)
		}
	}
	for _, input := range []string{"NaN:00", "1:Inf", "-1:00", "1:60", "one-1:00", "1:2:3:4", "1"} {
		if _, e := parseCPUTime(input); e == nil {
			t.Errorf("accepted %s", input)
		}
	}
}
func TestProcStat(t *testing.T) {
	// Fields 3..24, including a command name with spaces and parentheses.
	fields := strings.Fields("S 1 1 1 0 0 0 0 0 0 0 125 75 0 0 0 0 1 0 12345 100000 20")
	got, err := parseProcStat("123 (my (worker)) "+strings.Join(fields, " "), 100, 4096)
	if err != nil || got.PID != 123 || got.Name != "my (worker)" || got.seconds != 2 || got.RSS != 81920 || got.started != "12345" {
		t.Fatalf("bad stat: %+v %v", got, err)
	}
	for _, bad := range []string{"", "1 (bad)", "bad (worker) " + strings.Join(fields, " "), "0 (worker) " + strings.Join(fields, " ")} {
		if _, err := parseProcStat(bad, 100, 4096); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
	fields[21] = "-1"
	if _, err := parseProcStat("1 (bad) "+strings.Join(fields, " "), 100, 4096); err == nil {
		t.Fatal("negative RSS")
	}
}
func TestARCMemory(t *testing.T) {
	got := parseARC("name type data\nsize 4 1000\nc_max 4 2000\nhits 4 900000\n")
	if got == nil || got.Size != 1000 || got.Limit != 2000 {
		t.Fatalf("bad ARC: %+v", got)
	}
	for _, data := range []string{"", "size 4 1000", "size 4 -1\nc_max 4 1000", "size 4 100\nc_max 4 0"} {
		if parseARC(data) != nil {
			t.Errorf("accepted %q", data)
		}
	}
}
func TestProcessName(t *testing.T) {
	if got := processName("/private/path/worker\n"); got != "worker" {
		t.Fatal(got)
	}
	if len([]rune(processName(strings.Repeat("é", 100)))) != 80 {
		t.Fatal("unbounded name")
	}
	if processName("wor\x00ker") != "worker" {
		t.Fatal("control character exposed")
	}
}
