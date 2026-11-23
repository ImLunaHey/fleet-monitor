package main

import (
	"encoding/json"
	"runtime"
)

func hardwareModel() string {
	if runtime.GOOS != "darwin" {
		return ""
	}
	b, e := command("/usr/sbin/system_profiler", "SPHardwareDataType", "-json")
	if e != nil {
		return ""
	}
	return parseHardwareModel(b)
}
func parseHardwareModel(b []byte) string {
	var data struct {
		Hardware []struct {
			Name string `json:"machine_name"`
		} `json:"SPHardwareDataType"`
	}
	if json.Unmarshal(b, &data) != nil || len(data.Hardware) == 0 {
		return ""
	}
	return data.Hardware[0].Name
}
