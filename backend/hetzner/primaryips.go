package hetzner

import (
	"context"
	"time"
)

// ---- primary IPs -------------------------------------------------------

type PrimaryIPProtection struct {
	Delete bool `json:"delete"`
}

type PrimaryIPDNSPtr struct {
	IP     string `json:"ip"`
	DNSPtr string `json:"dns_ptr"`
}

type PrimaryIP struct {
	ID           int64               `json:"id"`
	IP           string              `json:"ip"`
	Labels       map[string]string   `json:"labels"`
	Name         string              `json:"name"`
	Type         string              `json:"type"`
	Protection   PrimaryIPProtection `json:"protection"`
	DNSPtr       []PrimaryIPDNSPtr   `json:"dns_ptr"`
	AssigneeID   *int64              `json:"assignee_id"`
	AssigneeType string              `json:"assignee_type"`
	AutoDelete   bool                `json:"auto_delete"`
	Blocked      bool                `json:"blocked"`
	Created      time.Time           `json:"created"`
	Location     Location            `json:"location"`
}

type PrimaryIPCreateRequest struct {
	Name         string            `json:"name"`
	Type         string            `json:"type"`
	AssigneeType string            `json:"assignee_type,omitempty"`
	AssigneeID   *int64            `json:"assignee_id,omitempty"`
	Labels       map[string]string `json:"labels,omitempty"`
	AutoDelete   *bool             `json:"auto_delete,omitempty"`
	Location     string            `json:"location,omitempty"`
}

type PrimaryIPCreateResponse struct {
	PrimaryIP PrimaryIP `json:"primary_ip"`
	Action    *Action   `json:"action"`
}

// PrimaryIPUpdateRequest is the PUT /primary_ips/{id} body. Only the fields
// the API accepts are representable.
type PrimaryIPUpdateRequest struct {
	Name       string            `json:"name,omitempty"`
	Labels     map[string]string `json:"labels,omitempty"`
	AutoDelete *bool             `json:"auto_delete,omitempty"`
}

func (c *Client) PrimaryIPs(ctx context.Context) ([]PrimaryIP, error) {
	return listAll[PrimaryIP](ctx, c, "/primary_ips", "primary_ips", nil)
}

func (c *Client) PrimaryIP(ctx context.Context, id int64) (*PrimaryIP, error) {
	return getResource[PrimaryIP](ctx, c, "primary_ips", id, "primary_ip")
}

func (c *Client) PrimaryIPCreate(ctx context.Context, req PrimaryIPCreateRequest) (*PrimaryIPCreateResponse, error) {
	var res PrimaryIPCreateResponse
	if err := createResource(ctx, c, "primary_ips", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (c *Client) PrimaryIPUpdate(ctx context.Context, id int64, body PrimaryIPUpdateRequest) (*PrimaryIP, error) {
	return updateResource[PrimaryIP](ctx, c, "primary_ips", id, body, "primary_ip")
}

func (c *Client) PrimaryIPDelete(ctx context.Context, id int64) (*Action, error) {
	return deleteResource(ctx, c, "primary_ips", id)
}

// DoPrimaryIPAction posts to /primary_ips/{id}/actions/{name} —
// assign, unassign, change_dns_ptr, change_protection.
func (c *Client) DoPrimaryIPAction(ctx context.Context, id int64, name string, payload any) (*ActionResponse, error) {
	return doResourceAction(ctx, c, "primary_ips", id, name, payload)
}
