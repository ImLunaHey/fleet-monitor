package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
)

func readProcesses(ctx context.Context) ([]processReading, bool, error) {
	// One bounded native call for the entire process table, not a subprocess per PID.
	cmd := exec.CommandContext(ctx, "/bin/ps", "-axo", "pid=,rss=,time=,lstart=,comm=")
	cmd.Env = append(os.Environ(), "LC_ALL=C")
	data, err := cmd.Output()
	if err != nil {
		return nil, false, err
	}
	result, partial := parsePS(string(data))
	if len(result) == 0 {
		return nil, partial, fmt.Errorf("process readings unavailable")
	}
	return result, partial, nil
}
func readARCMemory() *arcMemory { return nil }
