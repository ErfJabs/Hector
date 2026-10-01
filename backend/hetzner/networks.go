package hetzner

import (
	"context"
	"fmt"
	"time"
)

// ---- networks ----------------------------------------------------------

type NetworkProtection struct {
	Delete bool `json:"delete"`
}

type NetworkSubnet struct {
	Type        string `json:"type"`
	IPRange     string `json:"ip_range"`
	NetworkZone string `json:"network_zone"`
	Gateway     string `json:"gateway,omitempty"`
	VSwitchID   int64  `json:"vswitch_id,omitempty"`
}

type NetworkRoute struct {
	Destination string `json:"destination"`
	Gateway     string `json:"gateway"`
}

type Network struct {
	ID                    int64             `json:"id"`
	Name                  string            `json:"name"`
	Created               time.Time         `json:"created"`
	IPRange               string            `json:"ip_range"`
	Subnets               []NetworkSubnet   `json:"subnets"`
	Routes                []NetworkRoute    `json:"routes"`
	Servers               []int64           `json:"servers"`
	LoadBalancers         []int64           `json:"load_balancers"`
	Protection            NetworkProtection `json:"protection"`
	Labels                map[string]string `json:"labels"`
	ExposeRoutesToVSwitch bool              `json:"expose_routes_to_vswitch"`
}

type NetworkCreateRequest struct {
	Name                  string            `json:"name"`
	IPRange               string            `json:"ip_range"`
	Subnets               []NetworkSubnet   `json:"subnets,omitempty"`
	Routes                []NetworkRoute    `json:"routes,omitempty"`
	Labels                map[string]string `json:"labels,omitempty"`
	ExposeRoutesToVSwitch bool              `json:"expose_routes_to_vswitch"`
}

type NetworkCreateResponse struct {
	Network Network `json:"network"`
}

// NetworkUpdateRequest is the PUT /networks/{id} body.
type NetworkUpdateRequest struct {
	Name                  string            `json:"name,omitempty"`
	Labels                map[string]string `json:"labels,omitempty"`
	ExposeRoutesToVSwitch *bool             `json:"expose_routes_to_vswitch,omitempty"`
}

// NetworkMember is one resource attached to a network (server, LB, ...).
type NetworkMember struct {
	Type     string   `json:"type"`
	ID       int64    `json:"id"`
	IP       string   `json:"ip"`
	Status   string   `json:"status"`
	AliasIPs []string `json:"alias_ips"`
	Subnet   string   `json:"subnet"`
}

func (c *Client) Networks(ctx context.Context) ([]Network, error) {
	return listAll[Network](ctx, c, "/networks", "networks", nil)
}

func (c *Client) Network(ctx context.Context, id int64) (*Network, error) {
	return getResource[Network](ctx, c, "networks", id, "network")
}

func (c *Client) NetworkCreate(ctx context.Context, req NetworkCreateRequest) (*NetworkCreateResponse, error) {
	var res NetworkCreateResponse
	if err := createResource(ctx, c, "networks", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (c *Client) NetworkUpdate(ctx context.Context, id int64, body NetworkUpdateRequest) (*Network, error) {
	return updateResource[Network](ctx, c, "networks", id, body, "network")
}

func (c *Client) NetworkDelete(ctx context.Context, id int64) (*Action, error) {
	return deleteResource(ctx, c, "networks", id)
}

func (c *Client) DoNetworkAction(ctx context.Context, id int64, name string, payload any) (*ActionResponse, error) {
	return doResourceAction(ctx, c, "networks", id, name, payload)
}

// NetworkMembers lists the resources attached to a network
// (GET /networks/{id}/members).
func (c *Client) NetworkMembers(ctx context.Context, id int64) ([]NetworkMember, error) {
	return listAll[NetworkMember](ctx, c, fmt.Sprintf("/networks/%d/members", id), "members", nil)
}
