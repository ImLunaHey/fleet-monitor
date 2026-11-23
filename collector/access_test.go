package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRestrictClients(t *testing.T) {
	clients, err := parseClients("127.0.0.1, ::1, 192.0.2.0/24, 2001:db8:1::/64")
	if err != nil {
		t.Fatal(err)
	}
	handler := restrictClients(clients, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	for _, tc := range []struct {
		address string
		status  int
	}{
		{"127.0.0.1:1234", 204}, {"[::1]:1234", 204}, {"192.0.2.100:1234", 204},
		{"[::ffff:192.0.2.100]:1234", 204}, {"[2001:db8:1::4]:1234", 204},
		{"192.0.3.1:1234", 403}, {"[2001:db8:2::4]:1234", 403}, {"bad", 403}, {"invalid:1234", 403},
	} {
		t.Run(tc.address, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/fleet", nil)
			req.RemoteAddr = tc.address
			req.Header.Set("X-Forwarded-For", "127.0.0.1")
			res := httptest.NewRecorder()
			handler.ServeHTTP(res, req)
			if res.Code != tc.status {
				t.Fatalf("got %d, want %d", res.Code, tc.status)
			}
		})
	}
}
func TestParseClientsInvalid(t *testing.T) {
	for _, value := range []string{"", "192.0.2.0/99", "*", "localhost", "127.0.0.1,"} {
		if _, err := parseClients(value); err == nil {
			t.Errorf("accepted %q", value)
		}
	}
}
