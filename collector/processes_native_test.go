package main

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestNativeProcessSnapshot(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	rows, _, err := readProcesses(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		if row.PID == os.Getpid() {
			if row.RSS == 0 || row.Name == "" {
				t.Fatalf("invalid self reading: %+v", row)
			}
			return
		}
	}
	t.Fatal("collector process missing from native snapshot")
}
func TestNativeProcessCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := readProcesses(ctx); err == nil {
		t.Fatal("cancelled sample succeeded")
	}
}

func TestNativeARCWhenPresent(t *testing.T) {
	if _, err := os.Stat("/proc/spl/kstat/zfs/arcstats"); err != nil {
		t.Skip("No native ZFS ARC")
	}
	if arc := readARCMemory(); arc == nil {
		t.Fatal("native ARC counters could not be parsed")
	}
}
