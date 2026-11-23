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
	"time"
)

func TestHardwareIdentity(t *testing.T) {
	for _, b := range []string{`{}`, `{broken`, `{"SPHardwareDataType":[]}`} {
		if parseHardwareModel([]byte(b)) != "" {
			t.Fatal("invented model")
		}
	}
	if parseHardwareModel([]byte(`{"SPHardwareDataType":[{"machine_name":"MacBook Pro","serial_number":"private"}]}`)) != "MacBook Pro" {
		t.Fatal("model missing")
	}
}
func TestInferenceMetrics(t *testing.T) {
	input := "# HELP harmless\nllamacpp:requests_processing 1\nllamacpp:requests_deferred 0\nllamacpp:predicted_tokens_seconds 38.6\n"
	got, e := parseLlamaMetrics(input)
	if e != nil || *got.Active != 1 || *got.Queued != 0 || *got.TokensPerSecond != 38.6 {
		t.Fatalf("%+v %v", got, e)
	}
	for _, s := range []string{"", "llamacpp:requests_processing NaN", "llamacpp:requests_processing -1\nllamacpp:requests_deferred 0"} {
		if _, e := parseLlamaMetrics(s); e == nil {
			t.Fatal("accepted invalid metrics")
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Error("non-read-only request")
		}
		if r.URL.Path == "/metrics" {
			fmt.Fprint(w, input)
		} else {
			fmt.Fprint(w, `{"data":[{"id":"model-alias"}],"private":"must-not-leak"}`)
		}
	}))
	defer server.Close()
	got, e = collectLlama(context.Background(), server.URL)
	if e != nil || !got.Available || got.Model != "model-alias" {
		t.Fatalf("%+v %v", got, e)
	}
	b, _ := json.Marshal(got)
	if strings.Contains(string(b), "must-not-leak") {
		t.Fatal("leaked response")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := collectLlama(ctx, server.URL); e == nil {
		t.Fatal("ignored cancellation")
	}
	for _, mode := range []string{"failure", "missing-model", "bad-json", "redirect"} {
		t.Run(mode, func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if mode == "failure" {
					http.Error(w, "unavailable", 503)
					return
				}
				if mode == "redirect" {
					http.Redirect(w, r, server.URL, 302)
					return
				}
				if r.URL.Path == "/metrics" {
					fmt.Fprint(w, input)
				} else if mode == "bad-json" {
					fmt.Fprint(w, "{")
				} else {
					fmt.Fprint(w, `{"data":[]}`)
				}
			}))
			defer s.Close()
			if d, e := collectLlama(context.Background(), s.URL); e == nil || d.Available {
				t.Fatal("failed inference shown available")
			}
		})
	}
}
func TestUnifiSupplementalTelemetry(t *testing.T) {
	failed := false
	s := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/proxy/network/api/s/default/stat/device" || r.Header.Get("X-API-Key") != "key" || r.Method != "GET" {
			t.Error("unexpected request")
		}
		if failed {
			http.Error(w, "no", 401)
			return
		}
		fmt.Fprintf(w, `{"data":[{"mac":"match","last_seen":%d,"total_used_power":17.6,"total_max_effective_power":150,"port_table":[{"port_idx":1,"poe_power":"2.0"},{"port_idx":2,"poe_power":"NaN"}],"wan1":{"up":true,"rx_bytes-r":2048,"tx_bytes-r":0},"wan2":{"up":false,"rx_bytes-r":0,"tx_bytes-r":0}},{"mac":"stale","last_seen":1}]}`, time.Now().Unix())
	}))
	defer s.Close()
	h := sha256.Sum256(s.Certificate().Raw)
	c, e := newUnifiClient(s.URL+"/integration/v1", "key", "site", hex.EncodeToString(h[:]))
	if e != nil {
		t.Fatal(e)
	}
	if len(c.extras(context.Background(), "")) != 0 {
		t.Fatal("optional endpoint enabled by default")
	}
	extras := c.extras(context.Background(), "default")
	if len(extras) != 1 {
		t.Fatal("stale supplemental data accepted")
	}
	d := unifiDevice{Ports: []unifiPort{{Index: 1}, {Index: 2}}}
	applyUnifiExtra(&d, extras["match"])
	if *d.Power != 17.6 || *d.PowerBudget != 150 || *d.Ports[0].Power != 2 || d.Ports[1].Power != nil || len(d.WAN) != 1 || *d.WAN[0].Download != 2048 || *d.WAN[0].Upload != 0 {
		t.Fatalf("wrong supplemental metrics %+v", d)
	}
	failed = true
	if len(c.extras(context.Background(), "default")) != 0 {
		t.Fatal("failed request reused old data")
	}
}
