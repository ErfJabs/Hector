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

// Client talks to the Hetzner Cloud API.
type Client struct {
	http       *http.Client
	token      string
	baseURL    string
	proxyAddr  string // host:port of the proxy, "" = direct
	proxyLabel string // scheme://host:port [(auth)] — safe to log
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

	raw, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return err
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

// ---- servers -----------------------------------------------------------

func (c *Client) Servers(ctx context.Context) ([]Server, error) {
	return listAll[Server](ctx, c, "/servers", "servers", nil)
}

func (c *Client) Server(ctx context.Context, id int64) (*Server, error) {
	var res struct {
		Server Server `json:"server"`
	}
	if err := c.do(ctx, http.MethodGet, fmt.Sprintf("/servers/%d", id), nil, &res); err != nil {
		return nil, err
	}
	return &res.Server, nil
}

func (c *Client) ServerCreate(ctx context.Context, req ServerCreateRequest) (*ServerCreateResponse, error) {
	var res ServerCreateResponse
	if err := c.do(ctx, http.MethodPost, "/servers", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (c *Client) ServerUpdate(ctx context.Context, id int64, name string) (*Server, error) {
	var res struct {
		Server Server `json:"server"`
	}
	if err := c.do(ctx, http.MethodPut, fmt.Sprintf("/servers/%d", id), map[string]string{"name": name}, &res); err != nil {
		return nil, err
	}
	return &res.Server, nil
}

func (c *Client) ServerDelete(ctx context.Context, id int64) (*Action, error) {
	var res struct {
		Action Action `json:"action"`
	}
	if err := c.do(ctx, http.MethodDelete, fmt.Sprintf("/servers/%d", id), nil, &res); err != nil {
		return nil, err
	}
	return &res.Action, nil
}

// ActionResponse is what POST /servers/{id}/actions/{name} can return.
// Most actions fill only Action; rebuild, enable_rescue and reset_password
// can add RootPassword.
type ActionResponse struct {
	Action       Action  `json:"action"`
	RootPassword *string `json:"root_password"`
}

// DoServerAction posts to /servers/{id}/actions/{name}. payload may be nil.
func (c *Client) DoServerAction(ctx context.Context, id int64, name string, payload any) (*ActionResponse, error) {
	var res ActionResponse
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/servers/%d/actions/%s", id, name), payload, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ServerActions lists recent actions for one server, newest first, and
// reports how many actions the server has in total.
func (c *Client) ServerActions(ctx context.Context, id int64, perPage int) ([]Action, int, error) {
	q := url.Values{}
	q.Set("per_page", strconv.Itoa(perPage))
	// Hetzner's sort syntax is "field:direction"; a separate sort_order
	// parameter doesn't exist (it was ignored → oldest actions first).
	q.Set("sort", "id:desc")

	var raw map[string]json.RawMessage
	if err := c.do(ctx, http.MethodGet, fmt.Sprintf("/servers/%d/actions?%s", id, q.Encode()), nil, &raw); err != nil {
		return nil, 0, err
	}
	var meta struct {
		Pagination struct {
			TotalEntries int `json:"total_entries"`
		} `json:"pagination"`
	}
	if err := json.Unmarshal(raw["meta"], &meta); err != nil {
		return nil, 0, err
	}
	var actions []Action
	if err := json.Unmarshal(raw["actions"], &actions); err != nil {
		return nil, 0, fmt.Errorf("decode actions: %w", err)
	}
	return actions, meta.Pagination.TotalEntries, nil
}

// RunningActions lists actions currently running for the whole project.
func (c *Client) RunningActions(ctx context.Context) ([]Action, error) {
	q := url.Values{}
	q.Set("status", "running")
	q.Set("per_page", "50")
	return listAll[Action](ctx, c, "/actions", "actions", q)
}

func (c *Client) Action(ctx context.Context, id int64) (*Action, error) {
	var res struct {
		Action Action `json:"action"`
	}
	if err := c.do(ctx, http.MethodGet, fmt.Sprintf("/actions/%d", id), nil, &res); err != nil {
		return nil, err
	}
	return &res.Action, nil
}

// ---- metrics -----------------------------------------------------------

// ServerMetrics fetches metrics for one server. types is a list of
// "cpu", "disk", "network" (repeatable query parameter).
func (c *Client) ServerMetrics(ctx context.Context, id int64, types []string, start, end time.Time, step int) (*Metrics, error) {
	q := url.Values{}
	for _, t := range types {
		q.Add("type", t)
	}
	q.Set("start", start.UTC().Format(time.RFC3339))
	q.Set("end", end.UTC().Format(time.RFC3339))
	if step > 0 {
		q.Set("step", strconv.Itoa(step))
	}
	var res struct {
		Metrics Metrics `json:"metrics"`
	}
	if err := c.do(ctx, http.MethodGet, fmt.Sprintf("/servers/%d/metrics?%s", id, q.Encode()), nil, &res); err != nil {
		return nil, err
	}
	return &res.Metrics, nil
}

// ---- catalog -----------------------------------------------------------

func (c *Client) ServerTypes(ctx context.Context) ([]ServerType, error) {
	return listAll[ServerType](ctx, c, "/server_types", "server_types", nil)
}

func (c *Client) Locations(ctx context.Context) ([]Location, error) {
	return listAll[Location](ctx, c, "/locations", "locations", nil)
}

func (c *Client) Datacenters(ctx context.Context) ([]Datacenter, error) {
	return listAll[Datacenter](ctx, c, "/datacenters", "datacenters", nil)
}

func (c *Client) Images(ctx context.Context, imageType string) ([]Image, error) {
	q := url.Values{}
	if imageType != "" {
		q.Set("type", imageType)
	}
	return listAll[Image](ctx, c, "/images", "images", q)
}

func (c *Client) SSHKeys(ctx context.Context) ([]SSHKey, error) {
	return listAll[SSHKey](ctx, c, "/ssh_keys", "ssh_keys", nil)
}

func (c *Client) ISOs(ctx context.Context) ([]ISO, error) {
	return listAll[ISO](ctx, c, "/isos", "isos", nil)
}

func (c *Client) Pricing(ctx context.Context) (*Pricing, error) {
	var res struct {
		Pricing Pricing `json:"pricing"`
	}
	if err := c.do(ctx, http.MethodGet, "/pricing", nil, &res); err != nil {
		return nil, err
	}
	return &res.Pricing, nil
}
