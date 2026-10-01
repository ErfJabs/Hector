package hetzner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"golang.org/x/net/proxy"
)

const BaseURL = "https://api.hetzner.cloud/v1"

// ErrNoToken means HCLOUD_TOKEN is empty; every call fails fast with it.
var ErrNoToken = errors.New("HCLOUD_TOKEN is not set")

// APIError is a decoded Hetzner API error ({error: {code, message}}).
type APIError struct {
	Status  int
	Code    string
	Message string
}

func (e *APIError) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("hetzner %d: %s: %s", e.Status, e.Code, e.Message)
	}
	return fmt.Sprintf("hetzner %d: %s", e.Status, e.Message)
}

// RateLimit is the token quota as reported by Hetzner's Ratelimit-* response
// headers (3600 requests/hour by default). A zero Limit means "no header seen
// yet" — callers must then assume the quota is fine rather than block work.
type RateLimit struct {
	Limit     int       `json:"limit"`     // requests per window, 0 = unknown
	Remaining int       `json:"remaining"` // requests left in this window
	Reset     time.Time `json:"reset"`     // when the window refills
}

// Enough reports whether spending n more requests right now looks safe. It is
// deliberately pessimistic only after a header has proven the limit exists, so
// a mock backend without quota headers never disables anything.
func (r RateLimit) Enough(n int) bool {
	if r.Limit <= 0 {
		return true
	}
	if r.Remaining <= 0 {
		return false
	}
	return r.Remaining >= n
}

// RateLimitedError is returned when Hetzner answers 429. Reset is when the
// quota window refills (from Ratelimit-Reset or Retry-After).
type RateLimitedError struct {
	Reset time.Time
}

func (e *RateLimitedError) Error() string {
	if e.Reset.IsZero() {
		return "hetzner rate limit exceeded"
	}
	return fmt.Sprintf("hetzner rate limit exceeded until %s", e.Reset.UTC().Format(time.RFC3339))
}

// RetryAfter is how long the caller should wait, never negative, always a
// whole second (so the Retry-After header is never "0" while still waiting)
// and never more than an hour — a reset that far out is not worth blocking on.
func (e *RateLimitedError) RetryAfter() time.Duration {
	d := time.Until(e.Reset)
	if d <= 0 {
		return 0
	}
	secs := int64(d / time.Second)
	if d%time.Second != 0 {
		secs++
	}
	if secs > 3600 {
		secs = 3600
	}
	return time.Duration(secs) * time.Second
}

// Client talks to the Hetzner Cloud API.
type Client struct {
	http       *http.Client
	token      string
	baseURL    string
	proxyAddr  string // host:port of the proxy, "" = direct
	proxyLabel string // scheme://host:port [(auth)] — safe to log

	// quota holds the newest Ratelimit-* snapshot; written from the response
	// path of every request, read by the services layer before spending a
	// batch of calls. atomic.Pointer keeps the read path lock-free.
	quota atomic.Pointer[RateLimit]
}

// RateLimit returns the latest quota snapshot (zero value when none was ever
// received). Safe for concurrent use.
func (c *Client) RateLimit() RateLimit {
	if v := c.quota.Load(); v != nil {
		return *v
	}
	return RateLimit{}
}

// observeQuota records the Ratelimit-* headers of a response. Missing headers
// leave the previous snapshot in place.
func (c *Client) observeQuota(res *http.Response) {
	limit, _ := strconv.Atoi(res.Header.Get("Ratelimit-Limit"))
	remaining, _ := strconv.Atoi(res.Header.Get("Ratelimit-Remaining"))
	if limit <= 0 && remaining <= 0 {
		return
	}
	rl := RateLimit{Limit: limit, Remaining: remaining}
	if ts, err := strconv.ParseInt(res.Header.Get("Ratelimit-Reset"), 10, 64); err == nil && ts > 0 {
		rl.Reset = time.Unix(ts, 0)
	} else if ra, err := strconv.Atoi(res.Header.Get("Retry-After")); err == nil && ra > 0 {
		rl.Reset = time.Now().Add(time.Duration(ra) * time.Second)
	}
	// keep the previous Reset when this response carried neither header
	if rl.Reset.IsZero() {
		if prev := c.quota.Load(); prev != nil {
			rl.Reset = prev.Reset
		}
	}
	c.quota.Store(&rl)
}

// retryAfterFrom builds a RateLimitedError from a 429 response.
func retryAfterFrom(res *http.Response) *RateLimitedError {
	e := &RateLimitedError{}
	if ts, err := strconv.ParseInt(res.Header.Get("Ratelimit-Reset"), 10, 64); err == nil && ts > 0 {
		e.Reset = time.Unix(ts, 0)
		return e
	}
	if ra, err := strconv.Atoi(res.Header.Get("Retry-After")); err == nil && ra > 0 {
		e.Reset = time.Now().Add(time.Duration(ra) * time.Second)
		return e
	}
	return e
}

// ParseProxy reads PROXY_URL. Accepted:
//
//	socks5://user:pass@host:port   (socks5h:// too — DNS is resolved by the proxy)
//	http://user:pass@host:port     (CONNECT tunnel; https:// = TLS to the proxy)
//	host:port                      (no scheme = SOCKS5, the old SOCKS_PROXY form)
//
// Credentials are optional. A password with @ : / # ? must be URL-encoded.
func ParseProxy(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if !strings.Contains(raw, "://") {
		raw = "socks5://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("proxy URL: %w", err)
	}
	switch u.Scheme {
	case "socks5", "socks5h", "http", "https":
	default:
		return nil, fmt.Errorf("proxy URL: unsupported scheme %q (use socks5://, http:// or https://)", u.Scheme)
	}
	if u.Hostname() == "" || u.Port() == "" {
		return nil, fmt.Errorf("proxy URL: needs host:port, got %q", u.Host)
	}
	return u, nil
}

// New builds a client. When proxyURL is non-empty EVERY request goes
// through that proxy — there is no direct fallback: a dead proxy means
// failed requests, never a silent direct connection (Hetzner blocks some
// regions; leaking the real IP is not an option).
// baseURL overrides the API root (development against a local mock);
// empty keeps the real api.hetzner.cloud/v1.
func New(token, proxyURL, baseURL string) (*Client, error) {
	transport := &http.Transport{
		// no proxy configured = direct; HTTP(S)_PROXY from the OS env is
		// deliberately ignored so PROXY_URL is the single switch
		Proxy:               nil,
		MaxIdleConnsPerHost: 8,
		IdleConnTimeout:     60 * time.Second,
		TLSHandshakeTimeout: 15 * time.Second,
	}

	label := ""
	if proxyURL != "" {
		u, err := ParseProxy(proxyURL)
		if err != nil {
			return nil, err
		}
		label = u.Scheme + "://" + u.Host
		if u.User != nil {
			label += " (auth)"
		}
		switch u.Scheme {
		case "socks5", "socks5h":
			var auth *proxy.Auth
			if u.User != nil {
				pass, _ := u.User.Password()
				auth = &proxy.Auth{User: u.User.Username(), Password: pass}
			}
			dialer, err := proxy.SOCKS5("tcp", u.Host, auth, proxy.Direct)
			if err != nil {
				return nil, fmt.Errorf("socks proxy %s: %w", u.Host, err)
			}
			transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
				type ctxDialer interface {
					DialContext(ctx context.Context, network, address string) (net.Conn, error)
				}
				if cd, ok := dialer.(ctxDialer); ok {
					return cd.DialContext(ctx, network, address)
				}
				return dialer.Dial(network, address)
			}
		default: // http, https: CONNECT tunnel, Basic auth from the URL
			transport.Proxy = http.ProxyURL(u)
		}
	}

	if baseURL == "" {
		baseURL = BaseURL
	}

	c := &Client{
		http:       &http.Client{Timeout: 20 * time.Second, Transport: transport},
		token:      token,
		baseURL:    strings.TrimSuffix(baseURL, "/"),
		proxyLabel: label,
	}
	if proxyURL != "" {
		u, _ := ParseProxy(proxyURL)
		c.proxyAddr = u.Host
	}
	// no snapshot yet: RateLimit() reports the zero value and Enough() says yes
	return c, nil
}

// ProbeReport is the boot-time connectivity check: is the SOCKS proxy up,
// does the Hetzner API answer through it, and is the token accepted.
type ProbeReport struct {
	Proxy      string        // scheme://host:port [(auth)], "" = direct
	ProxyOK    bool          // TCP connect to the proxy worked
	ProxyTime  time.Duration // TCP connect time
	ProxyErr   error
	APIHost    string
	APIStatus  int // 0 = no HTTP answer at all
	APITime    time.Duration
	APIErr     error
	TokenValid bool
	ExitIP     string // public IP the world sees through the proxy
	ExitErr    error
}

// Probe checks the route to the Hetzner API once: TCP to the proxy (when
// one is set), then GET /locations?per_page=1 through the same transport
// the panel uses. Never fatal — the caller only logs the result.
func (c *Client) Probe(ctx context.Context) ProbeReport {
	r := ProbeReport{Proxy: c.proxyLabel}
	if u, err := url.Parse(c.baseURL); err == nil {
		r.APIHost = u.Host
	}

	if c.proxyAddr != "" {
		start := time.Now()
		conn, err := (&net.Dialer{Timeout: 4 * time.Second}).DialContext(ctx, "tcp", c.proxyAddr)
		r.ProxyTime = time.Since(start)
		if err != nil {
			r.ProxyErr = err
			return r // no point asking Hetzner through a dead proxy
		}
		conn.Close()
		r.ProxyOK = true
	}

	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, c.baseURL+"/locations?per_page=1", nil)
	if err != nil {
		r.APIErr = err
		return r
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	start := time.Now()
	res, err := c.http.Do(req)
	r.APITime = time.Since(start)
	if err != nil {
		r.APIErr = err
		return r
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<16))
	res.Body.Close()
	r.APIStatus = res.StatusCode
	r.TokenValid = c.token != "" && res.StatusCode < 400

	// Proof the traffic really leaves through the proxy: the exit IP as seen
	// from outside (fetched through the same transport).
	if c.proxyAddr != "" {
		ipCtx, cancelIP := context.WithTimeout(ctx, 8*time.Second)
		defer cancelIP()
		if req, err := http.NewRequestWithContext(ipCtx, http.MethodGet, "https://api.ipify.org", nil); err == nil {
			if res, err := c.http.Do(req); err != nil {
				r.ExitErr = err
			} else {
				body, _ := io.ReadAll(io.LimitReader(res.Body, 64))
				res.Body.Close()
				if ip := strings.TrimSpace(string(body)); res.StatusCode == 200 && net.ParseIP(ip) != nil {
					r.ExitIP = ip
				} else {
					r.ExitErr = fmt.Errorf("HTTP %d", res.StatusCode)
				}
			}
		}
	}
	return r
}

// Configured reports whether an API token is present.
func (c *Client) Configured() bool { return c.token != "" }

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	if c.token == "" {
		return ErrNoToken
	}

	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	c.observeQuota(res)

	raw, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return err
	}

	// 429 is not a Hetzner error envelope: it is a quota signal, and callers
	// (handlers) need the reset time to answer with Retry-After.
	if res.StatusCode == http.StatusTooManyRequests {
		return retryAfterFrom(res)
	}

	if res.StatusCode >= 400 {
		apiErr := &APIError{Status: res.StatusCode}
		var envelope struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(raw, &envelope) == nil && envelope.Error.Code != "" {
			apiErr.Code = envelope.Error.Code
			apiErr.Message = envelope.Error.Message
		} else {
			apiErr.Message = strings.TrimSpace(string(raw))
		}
		return apiErr
	}

	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("decode %s %s: %w", method, path, err)
		}
	}
	return nil
}

// listAll walks pagination and returns every item of a collection.
// key is the collection name inside the JSON body ("servers", "actions", ...).
func listAll[T any](ctx context.Context, c *Client, path, key string, q url.Values) ([]T, error) {
	if q == nil {
		q = url.Values{}
	}
	if q.Get("per_page") == "" {
		q.Set("per_page", "50")
	}

	var all []T
	page := 1
	for {
		q.Set("page", strconv.Itoa(page))

		var raw map[string]json.RawMessage
		if err := c.do(ctx, http.MethodGet, path+"?"+q.Encode(), nil, &raw); err != nil {
			return nil, err
		}

		var meta struct {
			Pagination struct {
				NextPage *int `json:"next_page"`
			} `json:"pagination"`
		}
		if err := json.Unmarshal(raw["meta"], &meta); err != nil {
			return nil, err
		}

		var items []T
		if err := json.Unmarshal(raw[key], &items); err != nil {
			return nil, fmt.Errorf("decode %s items: %w", key, err)
		}
		all = append(all, items...)

		if meta.Pagination.NextPage == nil {
			return all, nil
		}
		page = *meta.Pagination.NextPage
	}
}

// Page is a single page of a collection, with the pagination Hetzner reported.
type Page[T any] struct {
	Items   []T `json:"items"`
	Page    int `json:"page"`
	PerPage int `json:"perPage"`
	Total   int `json:"total"`
}

// listPage fetches exactly one page instead of walking the whole collection.
// Used where the API can hold far more rows than the UI should download in one
// request (the activity feed). q keys page/per_page are respected.
func listPage[T any](ctx context.Context, c *Client, path, key string, q url.Values) (*Page[T], error) {
	if q == nil {
		q = url.Values{}
	}
	if q.Get("per_page") == "" {
		q.Set("per_page", "50")
	}
	if q.Get("page") == "" {
		q.Set("page", "1")
	}

	var raw map[string]json.RawMessage
	if err := c.do(ctx, http.MethodGet, path+"?"+q.Encode(), nil, &raw); err != nil {
		return nil, err
	}

	var meta struct {
		Pagination struct {
			Page         int `json:"page"`
			PerPage      int `json:"per_page"`
			TotalEntries int `json:"total_entries"`
		} `json:"pagination"`
	}
	if err := json.Unmarshal(raw["meta"], &meta); err != nil {
		return nil, err
	}
	var items []T
	if err := json.Unmarshal(raw[key], &items); err != nil {
		return nil, fmt.Errorf("decode %s items: %w", key, err)
	}
	if items == nil {
		items = []T{}
	}
	return &Page[T]{
		Items:   items,
		Page:    meta.Pagination.Page,
		PerPage: meta.Pagination.PerPage,
		Total:   meta.Pagination.TotalEntries,
	}, nil
}
