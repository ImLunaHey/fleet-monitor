package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestUnifiPollAndCredentialBoundary(t *testing.T) {
	statsCalls := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || r.Header.Get("X-API-Key") != "test-key" {
			t.Error("expected authenticated GET")
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/sites/site/devices":
			fmt.Fprint(w, `{"totalCount":3,"data":[{"id":"gw"},{"id":"ap"},{"id":"sw"}]}`)
		case "/sites/site/clients":
			if r.URL.Query().Get("offset") == "0" {
				fmt.Fprint(w, `{"totalCount":2,"data":[{"type":"WIRELESS","uplinkDeviceId":"ap"}]}`)
			} else {
				fmt.Fprint(w, `{"totalCount":2,"data":[{"type":"WIRED","uplinkDeviceId":"sw"}]}`)
			}
		case "/sites/site/devices/gw":
			fmt.Fprint(w, `{"id":"gw","name":"Gateway","state":"ONLINE","features":{"switching":{}},"interfaces":{},"macAddress":"must-not-leak"}`)
		case "/sites/site/devices/ap":
			fmt.Fprint(w, `{"id":"ap","name":"AP","state":"ONLINE","features":{"accessPoint":{}},"uplink":{"deviceId":"sw"},"interfaces":{"radios":[{"frequencyGHz":5,"channel":44,"channelWidthMHz":80}]}}`)
		case "/sites/site/devices/sw":
			fmt.Fprint(w, `{"id":"sw","name":"Switch","state":"OFFLINE","uplink":{"deviceId":"gw"},"interfaces":{"ports":[{"idx":1,"state":"UP","speedMbps":2500,"connector":"RJ45","poe":{"state":"UP"}}]}}`)
		case "/sites/site/devices/gw/statistics/latest", "/sites/site/devices/ap/statistics/latest":
			statsCalls++
			fmt.Fprint(w, `{"cpuUtilizationPct":0,"memoryUtilizationPct":20,"uptimeSec":60,"lastHeartbeatAt":"2026-11-23T00:52:32Z","interfaces":{"radios":[{"frequencyGHz":5,"txRetriesPct":0}]}}`)
		default:
			t.Errorf("unexpected endpoint %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	hash := sha256.Sum256(server.Certificate().Raw)
	pin := hex.EncodeToString(hash[:])
	c, e := newUnifiClient(server.URL, "test-key", "site", pin)
	if e != nil {
		t.Fatal(e)
	}
	got, e := c.poll(context.Background())
	if e != nil {
		t.Fatal(e)
	}
	if !got.Available || got.Clients != 2 || got.Wired != 1 || got.Wireless != 1 || len(got.Devices) != 3 || statsCalls != 2 {
		t.Fatalf("unexpected snapshot %+v", got)
	}
	if got.Devices[0].Kind != "gateway" || got.Devices[1].Kind != "ap" || got.Devices[2].Kind != "switch" {
		t.Fatal("wrong device classification")
	}
	if got.Devices[1].Clients != 1 || got.Devices[1].Radios[0].Retries == nil || *got.Devices[1].Radios[0].Retries != 0 {
		t.Fatal("lost real zero or client attribution")
	}
	if got.Devices[2].CPU != nil || got.Devices[2].Timestamp != 0 {
		t.Fatal("offline data presented as fresh")
	}
	b, _ := json.Marshal(got)
	if strings.Contains(string(b), "must-not-leak") || strings.Contains(string(b), "test-key") {
		t.Fatal("private data leaked")
	}
	c, e = newUnifiClient(server.URL, "test-key", "site", strings.Repeat("00", 32))
	if e != nil {
		t.Fatal(e)
	}
	if _, e = c.poll(context.Background()); e == nil {
		t.Fatal("wrong certificate pin accepted")
	}
}
func TestUnifiRejectsRedirectAndBrokenPages(t *testing.T) {
	leaked := false
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaked = true }))
	defer destination.Close()
	for _, mode := range []string{"redirect", "unauthorized", "malformed", "incomplete", "cancelled"} {
		t.Run(mode, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch mode {
				case "redirect":
					http.Redirect(w, r, destination.URL, 302)
				case "unauthorized":
					http.Error(w, "private response", 401)
				case "malformed":
					fmt.Fprint(w, "{")
				default:
					fmt.Fprint(w, `{"totalCount":3,"data":[]}`)
				}
			}))
			defer server.Close()
			hash := sha256.Sum256(server.Certificate().Raw)
			c, e := newUnifiClient(server.URL, "test-key", "site", hex.EncodeToString(hash[:]))
			if e != nil {
				t.Fatal(e)
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if mode == "cancelled" {
				cancel()
			}
			got, e := c.poll(ctx)
			if e == nil || got.Available {
				t.Fatal("failure marked available")
			}
			if strings.Contains(e.Error(), "private response") {
				t.Fatal("controller response leaked in error")
			}
		})
	}
	if leaked {
		t.Fatal("followed redirect with credentials")
	}
}
func TestUnifiConfigurationValidation(t *testing.T) {
	for _, base := range []string{"http://localhost", "https://user:pass@example.com", "https://example.com/?token=x", "https://example.com/#fragment", "invalid"} {
		if _, e := newUnifiClient(base, "key", "site", ""); e == nil {
			t.Errorf("accepted %s", base)
		}
	}
	if _, e := newUnifiClient("https://example.com", "key", "site", "bad"); e == nil {
		t.Fatal("bad pin accepted")
	}
	if _, e := newUnifiClient("https://example.com", "key", "site", ""); e != nil {
		t.Fatal(e)
	}
}
