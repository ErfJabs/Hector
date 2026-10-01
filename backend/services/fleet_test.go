package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"hector/backend/hetzner"
)

// useTestClient points the package-wide Hetzner client at a local server and
// restores the previous one when the test ends.
func useTestClient(t *testing.T, handler http.Handler) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(handler)
	prev := hcloud
	client, err := hetzner.New("test-token", "", srv.URL)
	if err != nil {
		t.Fatalf("hetzner.New: %v", err)
	}
	hcloud = client
	t.Cleanup(func() {
		hcloud = prev
		srv.Close()
	})
	return srv
}

// isMetricsPath matches GET /servers/{id}/metrics.
func isMetricsPath(p string) bool {
	return len(p) > len("/metrics") && p[len(p)-len("/metrics"):] == "/metrics"
}

// seedQuota performs one real request so observeQuota records whatever the
// mock sent in the Ratelimit-* headers.
func seedQuota(t *testing.T) {
	t.Helper()
	if _, err := hcloud.Locations(context.Background()); err != nil {
		t.Fatalf("Locations: %v", err)
	}
}

func runningServers(n int) []hetzner.Server {
	out := make([]hetzner.Server, 0, n)
	for i := 1; i <= n; i++ {
		out = append(out, hetzner.Server{
			ID:         int64(i),
			Status:     "running",
			ServerType: hetzner.ServerType{Cores: 2},
		})
	}
	return out
}

// TestCPUSparklinesSkippedWhenQuotaIsEmpty is the guard that keeps the fleet
// screen from spending the whole hourly token budget on decoration: rebuilding
// the list costs 1 + N requests, and an empty window would starve every
// mutation in the panel.
func TestCPUSparklinesSkippedWhenQuotaIsEmpty(t *testing.T) {
	var metricsCalls atomic.Int64
	useTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Ratelimit-Limit", "3600")
		w.Header().Set("Ratelimit-Remaining", "0")
		w.Header().Set("Content-Type", "application/json")
		if isMetricsPath(r.URL.Path) {
			metricsCalls.Add(1)
			_, _ = w.Write([]byte(`{"metrics":{"time_series":{}}}`))
			return
		}
		_, _ = w.Write([]byte(`{"locations":[],"meta":{"pagination":{"page":1,"per_page":25,"total_entries":0}}}`))
	}))

	// One real request records the exhausted quota.
	seedQuota(t)

	if got := hcloud.RateLimit(); got.Enough(1) {
		t.Fatalf("quota = %+v, want it exhausted so the guard can fire", got)
	}

	cpu := cpuForServers(context.Background(), runningServers(8))
	if len(cpu) != 0 {
		t.Errorf("cpu = %v, want no sparklines under an empty quota", cpu)
	}
	if metricsCalls.Load() != 0 {
		t.Errorf("metrics requested %d times, want 0", metricsCalls.Load())
	}
}

func TestCPUSparklinesFetchedWhenQuotaIsHealthy(t *testing.T) {
	var metricsCalls atomic.Int64
	useTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Ratelimit-Limit", "3600")
		w.Header().Set("Ratelimit-Remaining", "3000")
		w.Header().Set("Content-Type", "application/json")
		if isMetricsPath(r.URL.Path) {
			metricsCalls.Add(1)
			_, _ = w.Write([]byte(`{"metrics":{"time_series":{"cpu":{"values":[["2026-01-01T00:00:00Z","40"],["2026-01-01T00:05:00Z","60"]]}}}}`))
			return
		}
		_, _ = w.Write([]byte(`{"locations":[],"meta":{"pagination":{"page":1,"per_page":25,"total_entries":0}}}`))
	}))

	seedQuota(t)

	cpu := cpuForServers(context.Background(), runningServers(2))
	if len(cpu) != 2 {
		t.Fatalf("cpu covers %d servers, want 2", len(cpu))
	}
	if metricsCalls.Load() != 2 {
		t.Errorf("metrics requested %d times, want 2", metricsCalls.Load())
	}

	// The core count is divided out: Hetzner sums across cores, the UI shows
	// utilization. 60%% over 2 cores must read as 30.
	info := cpu[1]
	if info == nil {
		t.Fatal("no sparkline for server 1")
	}
	if got := info.Now; got < 29 || got > 31 {
		t.Errorf("Now = %v, want ~30", got)
	}
	if len(info.Series) != 2 {
		t.Errorf("series = %v, want two points", info.Series)
	}
}

// TestCPUSparklinesToleratesPerServerFailures: one broken metrics endpoint
// must not fail the whole list.
func TestCPUSparklinesToleratesPerServerFailures(t *testing.T) {
	useTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Ratelimit-Remaining", "3000")
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/servers/1/metrics" {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`upstream down`))
			return
		}
		if isMetricsPath(r.URL.Path) {
			_, _ = w.Write([]byte(`{"metrics":{"time_series":{"cpu":{"values":[["2026-01-01T00:00:00Z","80"]]}}}}`))
			return
		}
		_, _ = w.Write([]byte(`{"locations":[],"meta":{"pagination":{"page":1,"per_page":25,"total_entries":0}}}`))
	}))

	seedQuota(t)

	cpu := cpuForServers(context.Background(), runningServers(2))
	if len(cpu) != 1 {
		t.Fatalf("cpu covers %d servers, want only the healthy one", len(cpu))
	}
	if _, ok := cpu[2]; !ok {
		t.Error("server 2 should still have a sparkline")
	}
	if _, ok := cpu[1]; ok {
		t.Error("server 1 must be dropped, not reported as zero")
	}
}
