package main

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type unifiPort struct {
	Index     int    `json:"idx"`
	State     string `json:"state"`
	Connector string `json:"connector"`
	Speed     *int   `json:"speedMbps"`
	PoE       *struct {
		State string `json:"state"`
	} `json:"poe,omitempty"`
}
type unifiRadio struct {
	Frequency float64  `json:"frequencyGHz"`
	Channel   *int     `json:"channel"`
	Width     *int     `json:"channelWidthMHz"`
	Retries   *float64 `json:"txRetriesPct"`
}
type unifiDevice struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	State     string       `json:"state"`
	Kind      string       `json:"kind"`
	CPU       *float64     `json:"cpu"`
	Memory    *float64     `json:"memory"`
	Uptime    *float64     `json:"uptime"`
	Timestamp int64        `json:"timestamp"`
	Ports     []unifiPort  `json:"ports"`
	Radios    []unifiRadio `json:"radios"`
	Clients   int          `json:"clients"`
}
type networkSnapshot struct {
	Available bool          `json:"available"`
	Timestamp int64         `json:"timestamp"`
	Devices   []unifiDevice `json:"devices"`
	Wired     int           `json:"wired"`
	Wireless  int           `json:"wireless"`
	Clients   int           `json:"clients"`
}

var networkData = networkSnapshot{}

type unifiClient struct {
	base, key, site string
	http            *http.Client
}

func newUnifiClient(base, key, site, pin string) (*unifiClient, error) {
	u, e := url.Parse(base)
	if e != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || site == "" || strings.TrimSpace(key) == "" {
		return nil, errors.New("invalid UniFi configuration")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	// An explicit certificate pin supports local controller certificates without
	// weakening verification for other endpoints or sending credentials first.
	if pin != "" {
		expected, e := hex.DecodeString(strings.ReplaceAll(pin, ":", ""))
		if e != nil || len(expected) != sha256.Size {
			return nil, errors.New("invalid UniFi certificate pin")
		}
		transport.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12, InsecureSkipVerify: true, VerifyConnection: func(s tls.ConnectionState) error {
			if len(s.PeerCertificates) == 0 {
				return errors.New("missing controller certificate")
			}
			hash := sha256.Sum256(s.PeerCertificates[0].Raw)
			if !strings.EqualFold(hex.EncodeToString(hash[:]), hex.EncodeToString(expected)) {
				return errors.New("controller certificate pin mismatch")
			}
			return nil
		}}
	}
	return &unifiClient{base: strings.TrimRight(base, "/"), key: strings.TrimSpace(key), site: url.PathEscape(site), http: &http.Client{Transport: transport, Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}
func (c *unifiClient) get(ctx context.Context, path string, out any) error {
	req, e := http.NewRequestWithContext(ctx, "GET", c.base+path, nil)
	if e != nil {
		return errors.New("invalid controller request")
	}
	req.Header.Set("X-API-Key", c.key)
	req.Header.Set("Accept", "application/json")
	r, e := c.http.Do(req)
	if e != nil {
		return errors.New("controller connection failed")
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return fmt.Errorf("controller HTTP %d", r.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(out)
}
func unifiPage[T any](ctx context.Context, c *unifiClient, path string) ([]T, error) {
	all := []T{}
	for offset := 0; offset < 10000; {
		var page struct {
			Data  []T `json:"data"`
			Total int `json:"totalCount"`
		}
		if e := c.get(ctx, fmt.Sprintf("%s?offset=%d&limit=200", path, offset), &page); e != nil {
			return nil, e
		}
		all = append(all, page.Data...)
		offset += len(page.Data)
		if offset >= page.Total {
			return all, nil
		}
		if len(page.Data) == 0 {
			return nil, errors.New("incomplete controller page")
		}
	}
	return nil, errors.New("controller inventory too large")
}
func (c *unifiClient) poll(ctx context.Context) (networkSnapshot, error) {
	root := "/sites/" + c.site
	devices, e := unifiPage[struct {
		ID string `json:"id"`
	}](ctx, c, root+"/devices")
	if e != nil {
		return networkSnapshot{}, e
	}
	clients, e := unifiPage[struct {
		Type   string `json:"type"`
		Uplink string `json:"uplinkDeviceId"`
	}](ctx, c, root+"/clients")
	if e != nil {
		return networkSnapshot{}, e
	}
	out := networkSnapshot{Timestamp: time.Now().Unix(), Devices: []unifiDevice{}, Clients: len(clients)}
	counts := map[string]int{}
	for _, cl := range clients {
		if cl.Type == "WIRED" {
			out.Wired++
		}
		if cl.Type == "WIRELESS" {
			out.Wireless++
		}
		counts[cl.Uplink]++
	}
	for _, entry := range devices {
		var d struct {
			ID     string `json:"id"`
			Name   string `json:"name"`
			State  string `json:"state"`
			Uplink *struct {
				ID string `json:"deviceId"`
			} `json:"uplink"`
			Features   map[string]json.RawMessage `json:"features"`
			Interfaces struct {
				Ports  []unifiPort  `json:"ports"`
				Radios []unifiRadio `json:"radios"`
			} `json:"interfaces"`
		}
		path := root + "/devices/" + url.PathEscape(entry.ID)
		if e := c.get(ctx, path, &d); e != nil {
			return networkSnapshot{}, e
		}
		device := unifiDevice{ID: d.ID, Name: d.Name, State: d.State, Kind: "switch", Ports: d.Interfaces.Ports, Radios: d.Interfaces.Radios, Clients: counts[d.ID]}
		if _, ok := d.Features["accessPoint"]; ok {
			device.Kind = "ap"
		} else if d.Uplink == nil {
			device.Kind = "gateway"
		}
		if d.State == "ONLINE" {
			var stats struct {
				CPU        *float64  `json:"cpuUtilizationPct"`
				Memory     *float64  `json:"memoryUtilizationPct"`
				Uptime     *float64  `json:"uptimeSec"`
				Heartbeat  time.Time `json:"lastHeartbeatAt"`
				Interfaces struct {
					Radios []unifiRadio `json:"radios"`
				} `json:"interfaces"`
			}
			if e := c.get(ctx, path+"/statistics/latest", &stats); e != nil {
				return networkSnapshot{}, e
			}
			device.CPU, device.Memory, device.Uptime = stats.CPU, stats.Memory, stats.Uptime
			if !stats.Heartbeat.IsZero() {
				device.Timestamp = stats.Heartbeat.Unix()
			}
			for i := range device.Radios {
				for _, radio := range stats.Interfaces.Radios {
					if radio.Frequency == device.Radios[i].Frequency {
						device.Radios[i].Retries = radio.Retries
					}
				}
			}
		}
		out.Devices = append(out.Devices, device)
	}
	out.Available = true
	return out, nil
}
func unifiLoop() {
	for {
		key, e := os.ReadFile(os.Getenv("UNIFI_API_KEY_FILE"))
		var data networkSnapshot
		if e == nil {
			c, err := newUnifiClient(os.Getenv("UNIFI_URL"), string(key), os.Getenv("UNIFI_SITE_ID"), os.Getenv("UNIFI_CERTIFICATE_SHA256"))
			if err == nil {
				ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
				data, e = c.poll(ctx)
				cancel()
				c.http.CloseIdleConnections()
			} else {
				e = err
			}
		}
		mu.Lock()
		if e == nil {
			networkData = data
		} else {
			networkData.Available = false
		}
		mu.Unlock()
		time.Sleep(10 * time.Second)
	}
}
