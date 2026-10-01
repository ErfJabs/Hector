package hetzner

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// newTestClient wires a Client at a local httptest server. Empty baseURL on
// New would mean the real api.hetzner.cloud, so the URL is always passed in.
func newTestClient(t *testing.T, handler http.Handler) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	c, err := New("test-token", "", srv.URL)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c
}

func TestRateLimitEnough(t *testing.T) {
	// A zero value means "no header seen yet": assume the quota is fine
	// rather than disabling work against a mock backend.
	var zero RateLimit
	if !zero.Enough(100) {
		t.Error("zero RateLimit must report Enough — no header is not a limit")
	}

	full := RateLimit{Limit: 3600, Remaining: 10}
	if !full.Enough(10) {
		t.Error("Remaining == n should still be enough")
	}
	if full.Enough(11) {
		t.Error("Remaining < n must not be enough")
	}

	empty := RateLimit{Limit: 3600, Remaining: 0}
	if empty.Enough(1) {
		t.Error("an exhausted window must never be enough")
	}
}

func TestRetryAfterIsRoundedUpAndCapped(t *testing.T) {
	now := time.Now()

	sub := &RateLimitedError{Reset: now.Add(1500 * time.Millisecond)}
	if got := sub.RetryAfter(); got != 2*time.Second {
		t.Errorf("1.5s must round up to 2s, got %s", got)
	}

	past := &RateLimitedError{Reset: now.Add(-time.Second)}
	if got := past.RetryAfter(); got != 0 {
		t.Errorf("a reset in the past must be 0, got %s", got)
	}

	far := &RateLimitedError{Reset: now.Add(10 * time.Hour)}
	if got := far.RetryAfter(); got != time.Hour {
		t.Errorf("a reset an hour out must cap at 1h, got %s", got)
	}
}

func TestDoObservesQuotaHeaders(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Ratelimit-Limit", "3600")
		w.Header().Set("Ratelimit-Remaining", "17")
		w.Header().Set("Ratelimit-Reset", "1893456000")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"locations":[]}`))
	}))

	var out struct {
		Locations []any `json:"locations"`
	}
	if err := c.do(context.Background(), http.MethodGet, "/locations", nil, &out); err != nil {
		t.Fatalf("do: %v", err)
	}

	got := c.RateLimit()
	if got.Limit != 3600 || got.Remaining != 17 {
		t.Errorf("quota = %+v, want limit 3600 remaining 17", got)
	}
	if want := time.Unix(1893456000, 0); !got.Reset.Equal(want) {
		t.Errorf("reset = %v, want %v", got.Reset, want)
	}
	if got.Enough(18) {
		t.Error("17 remaining must not cover 18 requests")
	}
}

func TestDo429ReturnsRateLimitedError(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "42")
		w.Header().Set("Ratelimit-Limit", "3600")
		w.Header().Set("Ratelimit-Remaining", "0")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`rate limit exceeded`))
	}))

	err := c.do(context.Background(), http.MethodGet, "/servers", nil, nil)

	var rateErr *RateLimitedError
	if !errors.As(err, &rateErr) {
		t.Fatalf("error = %v (%T), want *RateLimitedError", err, err)
	}
	if got := rateErr.RetryAfter(); got != 42*time.Second {
		t.Errorf("RetryAfter = %s, want 42s", got)
	}
}

func TestDoErrorEnvelope(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"code":"not_found","message":"resource not found"}}`))
	}))

	err := c.do(context.Background(), http.MethodGet, "/servers/99", nil, nil)

	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("error = %v (%T), want *APIError", err, err)
	}
	if apiErr.Status != http.StatusNotFound || apiErr.Code != "not_found" {
		t.Errorf("APIError = %+v, want status 404 code not_found", apiErr)
	}
	if apiErr.Error() == "" {
		t.Error("APIError.Error() must never be empty")
	}
}

func TestDoRequiresToken(t *testing.T) {
	c, err := New("", "", "http://127.0.0.1:1")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := c.do(context.Background(), http.MethodGet, "/servers", nil, nil); !errors.Is(err, ErrNoToken) {
		t.Errorf("error = %v, want ErrNoToken", err)
	}
}

// TestListAllPaginates walks a two-page collection and checks that the
// second page is requested and both pages are concatenated in order.
func TestListAllPaginates(t *testing.T) {
	var seenPages []string
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/servers" {
			t.Errorf("path = %s, want /servers", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Errorf("Authorization = %q", got)
		}
		page := r.URL.Query().Get("page")
		seenPages = append(seenPages, page)

		w.Header().Set("Content-Type", "application/json")
		if page == "" || page == "1" {
			_, _ = w.Write([]byte(`{"servers":[{"id":1},{"id":2}],"meta":{"pagination":{"page":1,"per_page":2,"next_page":2,"total_entries":3}}}`))
			return
		}
		_, _ = w.Write([]byte(`{"servers":[{"id":3}],"meta":{"pagination":{"page":2,"per_page":2,"total_entries":3}}}`))
	}))

	servers, err := c.Servers(context.Background())
	if err != nil {
		t.Fatalf("Servers: %v", err)
	}
	if len(servers) != 3 {
		t.Fatalf("got %d servers, want 3", len(servers))
	}
	for i, want := range []int64{1, 2, 3} {
		if servers[i].ID != want {
			t.Errorf("servers[%d].ID = %d, want %d", i, servers[i].ID, want)
		}
	}
	if len(seenPages) != 2 {
		t.Errorf("requested pages %v, want two requests", seenPages)
	}
}

func TestListPageReportsTotal(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("sort") != "id:desc" {
			t.Errorf("sort = %q, want id:desc", r.URL.Query().Get("sort"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"actions":[{"id":9}],"meta":{"pagination":{"page":1,"per_page":50,"total_entries":41}}}`))
	}))

	actions, total, err := c.ProjectActions(context.Background(), "", 50)
	if err != nil {
		t.Fatalf("ProjectActions: %v", err)
	}
	if len(actions) != 1 || actions[0].ID != 9 {
		t.Errorf("actions = %+v, want one action with id 9", actions)
	}
	if total != 41 {
		t.Errorf("total = %d, want 41", total)
	}
}

func TestRequestConsoleCarriesWSS(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/servers/7/actions/request_console" {
			t.Errorf("path = %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"action":{"id":1,"command":"request_console","status":"success"},"wss_url":"wss://x/1","password":"pw"}`))
	}))

	res, err := c.DoServerAction(context.Background(), 7, "request_console", nil)
	if err != nil {
		t.Fatalf("DoServerAction: %v", err)
	}
	if res.WSSURL != "wss://x/1" || res.Password != "pw" {
		t.Errorf("console = %q/%q", res.WSSURL, res.Password)
	}
	if res.First().ID != 1 {
		t.Errorf("First() = %+v, want action 1", res.First())
	}
}

func TestActionResponseHandlesFirewallList(t *testing.T) {
	raw := []byte(`{"actions":[{"id":11},{"id":12}]}`)
	var res ActionResponse
	if err := json.Unmarshal(raw, &res); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	all := res.All()
	if len(all) != 2 || all[0].ID != 11 || all[1].ID != 12 {
		t.Errorf("All() = %+v, want the two firewall actions", all)
	}
	if res.First().ID != 11 {
		t.Errorf("First() = %+v, want 11", res.First())
	}

	// A delete answers with an empty body: zero actions, no fake row.
	var empty ActionResponse
	if got := empty.All(); len(got) != 0 {
		t.Errorf("All() on empty = %+v, want none", got)
	}
	if empty.First().ID != 0 {
		t.Errorf("First() on empty = %+v, want zero value", empty.First())
	}
}
