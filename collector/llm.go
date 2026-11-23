package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

type llmMetrics struct {
	Available       bool     `json:"available"`
	Timestamp       int64    `json:"timestamp"`
	Model           string   `json:"model"`
	Active          *float64 `json:"active"`
	Queued          *float64 `json:"queued"`
	TokensPerSecond *float64 `json:"tokensPerSecond"`
}

var llmSnapshot *llmMetrics

func parseLlamaMetrics(text string) (llmMetrics, error) {
	out := llmMetrics{}
	fields := map[string]**float64{"llamacpp:requests_processing": &out.Active, "llamacpp:requests_deferred": &out.Queued, "llamacpp:predicted_tokens_seconds": &out.TokensPerSecond}
	scanner := bufio.NewScanner(strings.NewReader(text))
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) != 2 {
			continue
		}
		if target, ok := fields[parts[0]]; ok {
			if n, ok := num(parts[1]).(float64); ok && n >= 0 {
				*target = &n
			}
		}
	}
	if scanner.Err() != nil || out.Active == nil || out.Queued == nil {
		return out, errors.New("missing inference metrics")
	}
	return out, nil
}
func collectLlama(ctx context.Context, base string) (llmMetrics, error) {
	c := &http.Client{Timeout: 3 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	get := func(path string) ([]byte, error) {
		req, e := http.NewRequestWithContext(ctx, "GET", strings.TrimRight(base, "/")+path, nil)
		if e != nil {
			return nil, e
		}
		r, e := c.Do(req)
		if e != nil {
			return nil, e
		}
		defer r.Body.Close()
		if r.StatusCode != 200 {
			return nil, errors.New("inference endpoint unavailable")
		}
		return io.ReadAll(io.LimitReader(r.Body, 1<<20))
	}
	b, e := get("/metrics")
	if e != nil {
		return llmMetrics{}, e
	}
	out, e := parseLlamaMetrics(string(b))
	if e != nil {
		return out, e
	}
	b, e = get("/v1/models")
	if e != nil {
		return out, e
	}
	var models struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if json.Unmarshal(b, &models) != nil || len(models.Data) == 0 {
		return out, errors.New("loaded model unavailable")
	}
	out.Model = models.Data[0].ID
	out.Timestamp = time.Now().Unix()
	out.Available = true
	return out, nil
}
func llmLoop(base string) {
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		data, e := collectLlama(ctx, base)
		cancel()
		if e != nil {
			data = llmMetrics{Available: false}
		}
		mu.Lock()
		llmSnapshot = &data
		mu.Unlock()
		time.Sleep(5 * time.Second)
	}
}
