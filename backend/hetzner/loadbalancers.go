package hetzner

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// ---- load balancer types ----------------------------------------------

type LBTypePrice struct {
	Location string `json:"location"`
	Price    Price  `json:"price"`
}

type LoadBalancerType struct {
	ID                      int64         `json:"id"`
	Name                    string        `json:"name"`
	Description             string        `json:"description"`
	MaxConnections          int           `json:"max_connections"`
	MaxServices             int           `json:"max_services"`
	MaxTargets              int           `json:"max_targets"`
	MaxAssignedCertificates int           `json:"max_assigned_certificates"`
	Prices                  []LBTypePrice `json:"prices"`
	Deprecated              *string       `json:"deprecated"`
}

// ---- load balancers ----------------------------------------------------

type LoadBalancerAlgorithm struct {
	Type string `json:"type"`
}

type LoadBalancerProtection struct {
	Delete bool `json:"delete"`
}

type LoadBalancerPublicNetIPv4 struct {
	IP     string `json:"ip"`
	DNSPtr string `json:"dns_ptr"`
}

type LoadBalancerPublicNetIPv6 struct {
	IP     string `json:"ip"`
	DNSPtr string `json:"dns_ptr"`
}

type LoadBalancerPublicNet struct {
	Enabled bool                      `json:"enabled"`
	IPv4    LoadBalancerPublicNetIPv4 `json:"ipv4"`
	IPv6    LoadBalancerPublicNetIPv6 `json:"ipv6"`
}

type LoadBalancerPrivateNet struct {
	Network int64  `json:"network"`
	IP      string `json:"ip"`
}

type LoadBalancerServiceHTTP struct {
	CookieName     string  `json:"cookie_name"`
	CookieLifetime int     `json:"cookie_lifetime"`
	Certificates   []int64 `json:"certificates"`
	RedirectHTTP   bool    `json:"redirect_http"`
	StickySessions bool    `json:"sticky_sessions"`
	TimeoutIdle    int     `json:"timeout_idle"`
}

type LoadBalancerHealthCheckHTTP struct {
	Domain      string   `json:"domain"`
	Path        string   `json:"path"`
	Response    string   `json:"response"`
	StatusCodes []string `json:"status_codes"`
	TLS         bool     `json:"tls"`
}

type LoadBalancerServiceHealthCheck struct {
	Protocol string                       `json:"protocol"`
	Port     int                          `json:"port"`
	Interval int                          `json:"interval"`
	Timeout  int                          `json:"timeout"`
	Retries  int                          `json:"retries"`
	HTTP     *LoadBalancerHealthCheckHTTP `json:"http"`
}

type LoadBalancerService struct {
	Protocol        string                          `json:"protocol"`
	ListenPort      int                             `json:"listen_port"`
	DestinationPort int                             `json:"destination_port"`
	Proxyprotocol   bool                            `json:"proxyprotocol"`
	HTTP            *LoadBalancerServiceHTTP        `json:"http"`
	HealthCheck     *LoadBalancerServiceHealthCheck `json:"health_check"`
}

type LoadBalancerTargetServer struct {
	ID int64 `json:"id"`
}

type LoadBalancerTargetLabelSelector struct {
	Selector string `json:"selector"`
}

type LoadBalancerTargetIP struct {
	IP string `json:"ip"`
}

type LoadBalancerTargetHealth struct {
	ListenPort int    `json:"listen_port"`
	Status     string `json:"status"`
}

type LoadBalancerTarget struct {
	Type          string                           `json:"type"`
	Server        *LoadBalancerTargetServer        `json:"server"`
	LabelSelector *LoadBalancerTargetLabelSelector `json:"label_selector"`
	IP            *LoadBalancerTargetIP            `json:"ip"`
	HealthStatus  []LoadBalancerTargetHealth       `json:"health_status"`
	UsePrivateIP  bool                             `json:"use_private_ip"`
	Targets       []LoadBalancerTarget             `json:"targets,omitempty"`
}

type LoadBalancer struct {
	ID               int64                    `json:"id"`
	Name             string                   `json:"name"`
	PublicNet        LoadBalancerPublicNet    `json:"public_net"`
	PrivateNet       []LoadBalancerPrivateNet `json:"private_net"`
	Location         Location                 `json:"location"`
	LoadBalancerType LoadBalancerType         `json:"load_balancer_type"`
	Protection       LoadBalancerProtection   `json:"protection"`
	Labels           map[string]string        `json:"labels"`
	Created          time.Time                `json:"created"`
	Services         []LoadBalancerService    `json:"services"`
	Targets          []LoadBalancerTarget     `json:"targets"`
	Algorithm        LoadBalancerAlgorithm    `json:"algorithm"`
	IncludedTraffic  uint64                   `json:"included_traffic"`
	OutgoingTraffic  *uint64                  `json:"outgoing_traffic"`
	IngoingTraffic   *uint64                  `json:"ingoing_traffic"`
}

// LoadBalancerCreateTarget / Service are the POST /load_balancers payloads.
type LoadBalancerCreateTarget struct {
	Type          string                           `json:"type"`
	Server        *LoadBalancerTargetServer        `json:"server,omitempty"`
	LabelSelector *LoadBalancerTargetLabelSelector `json:"label_selector,omitempty"`
	IP            *LoadBalancerTargetIP            `json:"ip,omitempty"`
	UsePrivateIP  *bool                            `json:"use_private_ip,omitempty"`
}

type LoadBalancerCreateRequest struct {
	Name             string                     `json:"name"`
	LoadBalancerType IDOrName                   `json:"load_balancer_type"`
	Algorithm        *LoadBalancerAlgorithm     `json:"algorithm,omitempty"`
	Location         *string                    `json:"location,omitempty"`
	NetworkZone      *string                    `json:"network_zone,omitempty"`
	Labels           map[string]string          `json:"labels,omitempty"`
	Targets          []LoadBalancerCreateTarget `json:"targets,omitempty"`
	PublicInterface  *bool                      `json:"public_interface,omitempty"`
	Network          *int64                     `json:"network,omitempty"`
}

type LoadBalancerCreateResponse struct {
	LoadBalancer LoadBalancer `json:"load_balancer"`
	Action       Action       `json:"action"`
}

// LoadBalancerUpdateRequest is the PUT /load_balancers/{id} body.
type LoadBalancerUpdateRequest struct {
	Name   string            `json:"name,omitempty"`
	Labels map[string]string `json:"labels,omitempty"`
}

// Action payloads. Each one mirrors what the API accepts so a client cannot
// smuggle fields past the panel.

type LBTargetBody struct {
	Type          string                           `json:"type"`
	Server        *LoadBalancerTargetServer        `json:"server,omitempty"`
	LabelSelector *LoadBalancerTargetLabelSelector `json:"label_selector,omitempty"`
	IP            *LoadBalancerTargetIP            `json:"ip,omitempty"`
	UsePrivateIP  *bool                            `json:"use_private_ip,omitempty"`
}

type LBChangeTypeBody struct {
	LoadBalancerType IDOrName `json:"load_balancer_type"`
}

type LBChangeAlgorithmBody struct {
	Type string `json:"type"`
}

type LBAttachToNetworkBody struct {
	Network int64   `json:"network"`
	IP      *string `json:"ip,omitempty"`
	IPRange *string `json:"ip_range,omitempty"`
}

func (c *Client) LoadBalancers(ctx context.Context) ([]LoadBalancer, error) {
	return listAll[LoadBalancer](ctx, c, "/load_balancers", "load_balancers", nil)
}

func (c *Client) LoadBalancer(ctx context.Context, id int64) (*LoadBalancer, error) {
	return getResource[LoadBalancer](ctx, c, "load_balancers", id, "load_balancer")
}

func (c *Client) LoadBalancerCreate(ctx context.Context, req LoadBalancerCreateRequest) (*LoadBalancerCreateResponse, error) {
	var res LoadBalancerCreateResponse
	if err := createResource(ctx, c, "load_balancers", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (c *Client) LoadBalancerUpdate(ctx context.Context, id int64, body LoadBalancerUpdateRequest) (*LoadBalancer, error) {
	return updateResource[LoadBalancer](ctx, c, "load_balancers", id, body, "load_balancer")
}

func (c *Client) LoadBalancerDelete(ctx context.Context, id int64) (*Action, error) {
	return deleteResource(ctx, c, "load_balancers", id)
}

func (c *Client) DoLoadBalancerAction(ctx context.Context, id int64, name string, payload any) (*ActionResponse, error) {
	return doResourceAction(ctx, c, "load_balancers", id, name, payload)
}

// LoadBalancerActions lists recent actions for one load balancer.
func (c *Client) LoadBalancerActions(ctx context.Context, id int64, perPage int) ([]Action, int, error) {
	return resourceActions(ctx, c, "load_balancers", id, perPage)
}

// LoadBalancerMetrics fetches metrics for one load balancer
// (network / http type metrics).
func (c *Client) LoadBalancerMetrics(ctx context.Context, id int64, types []string, start, end time.Time, step int) (*Metrics, error) {
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
	path := "/load_balancers/" + strconv.FormatInt(id, 10) + "/metrics?" + q.Encode()
	if err := c.do(ctx, http.MethodGet, path, nil, &res); err != nil {
		return nil, err
	}
	return &res.Metrics, nil
}

// LoadBalancerTypes lists the purchasable load balancer types.
func (c *Client) LoadBalancerTypes(ctx context.Context) ([]LoadBalancerType, error) {
	return listAll[LoadBalancerType](ctx, c, "/load_balancer_types", "load_balancer_types", nil)
}
