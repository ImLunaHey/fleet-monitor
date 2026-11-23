package main

import (
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// Parse once at startup and reject malformed entries rather than broadening access.
func parseClients(value string) ([]netip.Prefix, error) {
	var clients []netip.Prefix
	for _, entry := range strings.Split(value, ",") {
		entry = strings.TrimSpace(entry)
		if address, err := netip.ParseAddr(entry); err == nil {
			address = address.Unmap()
			clients = append(clients, netip.PrefixFrom(address, address.BitLen()))
		} else if prefix, err := netip.ParsePrefix(entry); err == nil {
			clients = append(clients, prefix.Masked())
		} else {
			return nil, fmt.Errorf("invalid allowed client %q: use an IP address or CIDR subnet", entry)
		}
	}
	return clients, nil
}

func restrictClients(clients []netip.Prefix, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err == nil {
			address, err := netip.ParseAddr(host)
			if err == nil {
				for _, prefix := range clients {
					if prefix.Contains(address.Unmap()) {
						next.ServeHTTP(w, r)
						return
					}
				}
			}
		}
		http.Error(w, "Forbidden", http.StatusForbidden)
	})
}
