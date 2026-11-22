package main

import (
	"math"
	"regexp"
	"runtime"
	"strconv"
)

func temperatureAverage(values []float64) any {
	total := 0.0
	count := 0
	for _, v := range values {
		if !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 10 && v <= 130 {
			total += v
			count++
		}
	}
	if count == 0 {
		return nil
	}
	return total / float64(count)
}
func battery() M {
	if runtime.GOOS != "darwin" {
		return nil
	}
	b, e := command("/usr/sbin/ioreg", "-r", "-d", "1", "-c", "AppleSmartBattery", "-l")
	if e != nil {
		return nil
	}
	return parseBattery(b)
}
func parseBattery(b []byte) M {
	get := func(key string) string {
		m := regexp.MustCompile(`(?m)^\s*"` + regexp.QuoteMeta(key) + `"\s*=\s*([^\r\n]+)`).FindSubmatch(b)
		if len(m) != 2 {
			return ""
		}
		return string(m[1])
	}
	current, e := strconv.ParseFloat(get("CurrentCapacity"), 64)
	if e != nil {
		return nil
	}
	max, e := strconv.ParseFloat(get("MaxCapacity"), 64)
	if e != nil || max <= 0 {
		return nil
	}
	status := "On battery"
	if get("ExternalConnected") == "Yes" {
		status = "Plugged in · not charging"
	}
	if get("IsCharging") == "Yes" {
		status = "Charging"
	} else if get("FullyCharged") == "Yes" {
		status = "Fully charged"
	}
	var minutes any
	if n, e := strconv.Atoi(get("TimeRemaining")); e == nil && n > 0 && n < 65535 {
		minutes = n
	}
	return M{"percent": math.Min(100, math.Max(0, current/max*100)), "charging": get("IsCharging") == "Yes", "plugged_in": get("ExternalConnected") == "Yes", "status": status, "minutes_remaining": minutes, "cycles": num(get("CycleCount"))}
}
