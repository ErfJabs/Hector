package hetzner

import (
	"context"
	"time"
)

// ---- firewalls ---------------------------------------------------------

// FirewallRule is a rule as it appears in a firewall response. Port and
// Description are pointers because the API returns null for "any port" and
// "no description".
type FirewallRule struct {
	Direction      string   `json:"direction"`
	SourceIPs      []string `json:"source_ips"`
	DestinationIPs []string `json:"destination_ips"`
	Protocol       string   `json:"protocol"`
	Port           *string  `json:"port"`
	Description    *string  `json:"description"`
}

// FirewallRuleBody is the request-side shape: omitempty keeps "no
// description" out of the payload instead of sending an empty string.
type FirewallRuleBody struct {
	Direction      string   `json:"direction"`
	SourceIPs      []string `json:"source_ips,omitempty"`
	DestinationIPs []string `json:"destination_ips,omitempty"`
	Protocol       string   `json:"protocol"`
	Port           *string  `json:"port,omitempty"`
	Description    *string  `json:"description,omitempty"`
}

// FirewallResource is a firewall target: a server, a label selector or a
// nested resource list (used by apply/remove).
type FirewallResource struct {
	Type               string                         `json:"type"`
	Server             *FirewallResourceServer        `json:"server,omitempty"`
	LabelSelector      *FirewallResourceLabelSelector `json:"label_selector,omitempty"`
	AppliedToResources []FirewallResource             `json:"applied_to_resources,omitempty"`
}

type FirewallResourceServer struct {
	ID int64 `json:"id"`
}

type FirewallResourceLabelSelector struct {
	Selector string `json:"selector"`
}

type Firewall struct {
	ID        int64              `json:"id"`
	Name      string             `json:"name"`
	Labels    map[string]string  `json:"labels"`
	Created   time.Time          `json:"created"`
	Rules     []FirewallRule     `json:"rules"`
	AppliedTo []FirewallResource `json:"applied_to"`
}

type FirewallCreateRequest struct {
	Name    string             `json:"name"`
	Labels  map[string]string  `json:"labels,omitempty"`
	Rules   []FirewallRuleBody `json:"rules,omitempty"`
	ApplyTo []FirewallResource `json:"apply_to,omitempty"`
}

type FirewallCreateResponse struct {
	Firewall Firewall `json:"firewall"`
	Actions  []Action `json:"actions"`
}

// FirewallUpdateRequest is the PUT /firewalls/{id} body.
type FirewallUpdateRequest struct {
	Name   string            `json:"name,omitempty"`
	Labels map[string]string `json:"labels,omitempty"`
}

func (c *Client) Firewalls(ctx context.Context) ([]Firewall, error) {
	return listAll[Firewall](ctx, c, "/firewalls", "firewalls", nil)
}

func (c *Client) Firewall(ctx context.Context, id int64) (*Firewall, error) {
	return getResource[Firewall](ctx, c, "firewalls", id, "firewall")
}

func (c *Client) FirewallCreate(ctx context.Context, req FirewallCreateRequest) (*FirewallCreateResponse, error) {
	var res FirewallCreateResponse
	if err := createResource(ctx, c, "firewalls", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (c *Client) FirewallUpdate(ctx context.Context, id int64, body FirewallUpdateRequest) (*Firewall, error) {
	return updateResource[Firewall](ctx, c, "firewalls", id, body, "firewall")
}

func (c *Client) FirewallDelete(ctx context.Context, id int64) (*Action, error) {
	return deleteResource(ctx, c, "firewalls", id)
}

// DoFirewallAction posts to /firewalls/{id}/actions/{name}. Unlike most
// resources the rule/apply/remove endpoints answer with {actions: [...]},
// which ActionResponse.All() handles.
func (c *Client) DoFirewallAction(ctx context.Context, id int64, name string, payload any) (*ActionResponse, error) {
	return doResourceAction(ctx, c, "firewalls", id, name, payload)
}
