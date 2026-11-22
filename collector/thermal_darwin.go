package main

import (
	"encoding/binary"
	"fmt"
	"github.com/ebitengine/purego"
	"math"
	"strings"
	"sync"
	"unsafe"
)

// AppleSMC's read-only protocol (also used by gopsutil and macmon).
// Sensor key classification follows macmon's documented Tp/Te/Ts and Tg
// families: https://github.com/vladkens/macmon/blob/main/src/metrics.rs .
// PMU/HID temperatures are deliberately not labelled CPU core temperatures.
type smcReader struct {
	conn             uint32
	call             func(uint32, uint32, unsafe.Pointer, uintptr, unsafe.Pointer, *uintptr) int32
	keys             map[uint32][12]byte
	cpuKeys, gpuKeys []uint32
}

var smcOnce sync.Once
var smc *smcReader

func fourCC(s string) uint32 { return binary.BigEndian.Uint32([]byte(s)) }
func (s *smcReader) request(in [80]byte) ([80]byte, error) {
	var out [80]byte
	size := uintptr(len(out))
	code := s.call(s.conn, 2, unsafe.Pointer(&in[0]), 80, unsafe.Pointer(&out[0]), &size)
	if code != 0 || out[40] != 0 || size != 80 {
		return out, fmt.Errorf("SMC read failed: %d/%d", code, out[40])
	}
	return out, nil
}
func (s *smcReader) read(key uint32) ([]byte, uint32, error) {
	info, ok := s.keys[key]
	if !ok {
		var in [80]byte
		binary.LittleEndian.PutUint32(in[:4], key)
		in[42] = 9
		out, e := s.request(in)
		if e != nil {
			return nil, 0, e
		}
		copy(info[:], out[28:40])
		s.keys[key] = info
	}
	size := binary.LittleEndian.Uint32(info[:4])
	kind := binary.LittleEndian.Uint32(info[4:8])
	if size > 32 {
		return nil, 0, fmt.Errorf("SMC value too large")
	}
	var in [80]byte
	binary.LittleEndian.PutUint32(in[:4], key)
	copy(in[28:40], info[:])
	in[42] = 5
	out, e := s.request(in)
	if e != nil {
		return nil, 0, e
	}
	return out[48 : 48+size], kind, nil
}
func initSMC() {
	lib, e := purego.Dlopen("/System/Library/Frameworks/IOKit.framework/IOKit", purego.RTLD_NOW|purego.RTLD_LOCAL)
	if e != nil {
		return
	}
	var matching func(string) uintptr
	var getService func(uint32, uintptr) uint32
	var open func(uint32, uint32, uint32, *uint32) int32
	var release func(uint32) int32
	var task func() uint32
	purego.RegisterLibFunc(&matching, lib, "IOServiceMatching")
	purego.RegisterLibFunc(&getService, lib, "IOServiceGetMatchingService")
	purego.RegisterLibFunc(&open, lib, "IOServiceOpen")
	purego.RegisterLibFunc(&release, lib, "IOObjectRelease")
	purego.RegisterLibFunc(&task, lib, "mach_task_self")
	device := getService(0, matching("AppleSMC"))
	if device == 0 {
		purego.Dlclose(lib)
		return
	}
	defer release(device)
	reader := &smcReader{keys: map[uint32][12]byte{}}
	if open(device, task(), 0, &reader.conn) != 0 {
		purego.Dlclose(lib)
		return
	}
	// Keep the connection/library for the collector lifetime; reads are serial.
	purego.RegisterLibFunc(&reader.call, lib, "IOConnectCallStructMethod")
	count, _, e := reader.read(fourCC("#KEY"))
	if e != nil || len(count) != 4 {
		return
	}
	for i := uint32(0); i < min(binary.BigEndian.Uint32(count), 16384); i++ {
		var in [80]byte
		in[42] = 8
		binary.LittleEndian.PutUint32(in[44:48], i)
		out, e := reader.request(in)
		if e != nil {
			continue
		}
		key := binary.LittleEndian.Uint32(out[:4])
		var b [4]byte
		binary.BigEndian.PutUint32(b[:], key)
		name := string(b[:])
		if strings.HasPrefix(name, "Tp") || strings.HasPrefix(name, "Te") || (strings.HasPrefix(name, "Ts") && !strings.HasSuffix(name, "P")) {
			reader.cpuKeys = append(reader.cpuKeys, key)
		}
		if strings.HasPrefix(name, "Tg") {
			reader.gpuKeys = append(reader.gpuKeys, key)
		}
	}
	smc = reader
}
func (s *smcReader) average(keys []uint32) any {
	values := []float64{}
	for _, key := range keys {
		b, kind, e := s.read(key)
		if e == nil && kind == fourCC("flt ") && len(b) == 4 {
			values = append(values, float64(math.Float32frombits(binary.LittleEndian.Uint32(b))))
		}
	}
	return temperatureAverage(values)
}
func macTemperatures() (any, any) {
	smcOnce.Do(initSMC)
	if smc == nil {
		return nil, nil
	}
	return smc.average(smc.cpuKeys), smc.average(smc.gpuKeys)
}
