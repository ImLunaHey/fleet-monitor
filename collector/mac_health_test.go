package main

import (
	"math"
	"testing"
)

func TestTemperatureAverageRejectsInvalidSensors(t *testing.T) {
	if got := temperatureAverage([]float64{0, 5, 50, 60, 200, math.NaN()}); got != float64(55) {
		t.Fatal(got)
	}
	if temperatureAverage([]float64{0, 200}) != nil {
		t.Fatal("invalid temperatures presented as real")
	}
}
func TestBatteryChargingAndUnknownTime(t *testing.T) {
	b := []byte(`"CurrentCapacity" = 80
"MaxCapacity" = 100
"ExternalConnected" = Yes
"IsCharging" = No
"TimeRemaining" = 65535
"CycleCount" = 396`)
	m := parseBattery(b)
	if m["percent"] != float64(80) || m["status"] != "Plugged in · not charging" || m["minutes_remaining"] != nil {
		t.Fatal(m)
	}
	if parseBattery(nil) != nil {
		t.Fatal("desktop has a phantom battery")
	}
}
