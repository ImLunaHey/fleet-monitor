package main

import (
	"context"
	"fmt"
	"os"
	"strconv"

	"github.com/tklauser/go-sysconf"
)

func readProcesses(ctx context.Context) ([]processReading, bool, error) {
	ticks, err := sysconf.Sysconf(sysconf.SC_CLK_TCK)
	if err != nil || ticks <= 0 {
		return nil, false, fmt.Errorf("CPU clock unavailable")
	}
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, false, err
	}
	result := []processReading{}
	partial := false
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return nil, false, err
		}
		if _, err := strconv.Atoi(entry.Name()); err != nil {
			continue
		}
		data, err := os.ReadFile("/proc/" + entry.Name() + "/stat")
		if err != nil {
			if os.IsPermission(err) {
				partial = true
			}
			continue
		}
		p, err := parseProcStat(string(data), float64(ticks), uint64(os.Getpagesize()))
		if err != nil {
			partial = true
			continue
		}
		result = append(result, p)
	}
	if len(result) == 0 {
		return nil, partial, fmt.Errorf("process readings unavailable")
	}
	return result, partial, nil
}
func readARCMemory() *arcMemory {
	data, err := os.ReadFile("/proc/spl/kstat/zfs/arcstats")
	if err != nil {
		return nil
	}
	return parseARC(string(data))
}
