package hetzner

import (
	"context"
	"time"
)

// ---- floating IPs ------------------------------------------------------

type FloatingIPProtection struct {
	Delete bool `json:"delete"`
}

type FloatingIPDNSPtr struct {
	IP     string `json:"ip"`
	DNSPtr string `json:"dns_ptr"`
}

type FloatingIP struct {
	ID           int64                `json:"id"`
	Description  *string              `json:"description"`
	Created      time.Time            `json:"created"`
	IP           string               `json:"ip"`
	Type         string               `json:"type"`
	Server       *int64               `json:"server"`
	DNSPtr       []FloatingIPDNSPtr   `json:"dns_ptr"`
	HomeLocation Location             `json:"home_location"`
	Blocked      bool                 `json:"blocked"`
	Protection   FloatingIPProtection `json:"protection"`
	Labels       map[string]string    `json:"labels"`
	Name         string               `json:"name"`
}

type FloatingIPCreateRequest struct {
	Type         string            `json:"type"`
	HomeLocation *IDOrName         `json:"home_location,omitempty"`
	Server       *int64            `json:"server,omitempty"`
	Description  *string           `json:"description,omitempty"`
	Labels       map[string]string `json:"labels,omitempty"`
	Name         *string           `json:"name,omitempty"`
}

type FloatingIPCreateResponse struct {
	FloatingIP FloatingIP `json:"floating_ip"`
	Action     *Action    `json:"action"`
}

// FloatingIPUpdateRequest is the PUT /floating_ips/{id} body.
type FloatingIPUpdateRequest struct {
	Description string            `json:"description,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Name        string            `json:"name,omitempty"`
}

func (c *Client) FloatingIPs(ctx context.Context) ([]FloatingIP, error) {
	return listAll[FloatingIP](ctx, c, "/floating_ips", "floating_ips", nil)
}

func (c *Client) FloatingIP(ctx context.Context, id int64) (*FloatingIP, error) {
	return getResource[FloatingIP](ctx, c, "floating_ips", id, "floating_ip")
}

func (c *Client) FloatingIPCreate(ctx context.Context, req FloatingIPCreateRequest) (*FloatingIPCreateResponse, error) {
	var res FloatingIPCreateResponse
	if err := createResource(ctx, c, "floating_ips", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (c *Client) FloatingIPUpdate(ctx context.Context, id int64, body FloatingIPUpdateRequest) (*FloatingIP, error) {
	return updateResource[FloatingIP](ctx, c, "floating_ips", id, body, "floating_ip")
}

func (c *Client) FloatingIPDelete(ctx context.Context, id int64) (*Action, error) {
	return deleteResource(ctx, c, "floating_ips", id)
}

// DoFloatingIPAction posts to /floating_ips/{id}/actions/{name} —
// assign, unassign, change_dns_ptr, change_protection.
func (c *Client) DoFloatingIPAction(ctx context.Context, id int64, name string, payload any) (*ActionResponse, error) {
	return doResourceAction(ctx, c, "floating_ips", id, name, payload)
}
