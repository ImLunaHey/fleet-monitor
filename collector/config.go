package main

import (
	"net"
	"os"
	"strings"
)

func localName() string {
	name, _ := os.Hostname()
	return env("METRICS_NAME", strings.Split(name, ".")[0])
}
func defaultInterface() string {
	// A UDP connect chooses the default route without sending any datagram.
	c, e := net.DialUDP("udp4", nil, &net.UDPAddr{IP: net.IPv4(192, 0, 2, 1), Port: 9})
	if e != nil {
		return "unknown"
	}
	defer c.Close()
	ip := c.LocalAddr().(*net.UDPAddr).IP
	interfaces, _ := net.Interfaces()
	for _, iface := range interfaces {
		addresses, _ := iface.Addrs()
		for _, a := range addresses {
			local, _, _ := net.ParseCIDR(a.String())
			if local.Equal(ip) {
				return iface.Name
			}
		}
	}
	return "unknown"
}
