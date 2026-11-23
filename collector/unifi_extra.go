package main

import (
	"context"
	"net/url"
	"time"
)

// Optional UniFi OS compatibility endpoint. It supplements the Integration API
// with WAN byte rates and measured PoE watts, never generic uplink traffic.
// Its UUIDs differ: correlate internally by MAC and never publish addresses.
type unifiExtra struct {
	MAC    string   `json:"mac"`
	Seen   int64    `json:"last_seen"`
	Power  *float64 `json:"total_used_power"`
	Budget *float64 `json:"total_max_effective_power"`
	Ports  []struct {
		Index int    `json:"port_idx"`
		Power string `json:"poe_power"`
	} `json:"port_table"`
	WAN1 *unifiWAN `json:"wan1"`
	WAN2 *unifiWAN `json:"wan2"`
}
type unifiWAN struct {
	Up       bool     `json:"up"`
	Download *float64 `json:"rx_bytes-r"`
	Upload   *float64 `json:"tx_bytes-r"`
}

func (c *unifiClient) extras(ctx context.Context, site string) map[string]unifiExtra {
	out := map[string]unifiExtra{}
	if site == "" {
		return out
	}
	u, _ := url.Parse(c.base)
	copyClient := *c
	copyClient.base = u.Scheme + "://" + u.Host
	var response struct {
		Data []unifiExtra `json:"data"`
	}
	if copyClient.get(ctx, "/proxy/network/api/s/"+url.PathEscape(site)+"/stat/device", &response) != nil {
		return out
	}
	for _, d := range response.Data {
		if age := time.Now().Unix() - d.Seen; age >= 0 && age < 90 {
			out[d.MAC] = d
		}
	}
	return out
}
func applyUnifiExtra(device *unifiDevice, extra unifiExtra) {
	device.Power, device.PowerBudget = extra.Power, extra.Budget
	device.ExtraTimestamp = &extra.Seen
	for i := range device.Ports {
		for _, port := range extra.Ports {
			if port.Index == device.Ports[i].Index {
				if n, ok := num(port.Power).(float64); ok && n >= 0 {
					device.Ports[i].Power = &n
				}
			}
		}
	}
	for _, wan := range []*unifiWAN{extra.WAN1, extra.WAN2} {
		if wan == nil || !wan.Up {
			continue
		}
		device.WAN = append(device.WAN, *wan)
	}
}
