package services

import (
	"context"
	"fmt"

	"hector/backend/hetzner"
	"hector/backend/types"
)

// ---- firewalls ---------------------------------------------------------

func toFirewallRule(r hetzner.FirewallRule) types.FirewallRule {
	out := types.FirewallRule{
		Direction:    r.Direction,
		Protocol:     r.Protocol,
		Port:         deref(r.Port),
		Description:  deref(r.Description),
		Sources:      r.SourceIPs,
		Destinations: r.DestinationIPs,
	}
	if out.Sources == nil {
		out.Sources = []string{}
	}
	if out.Destinations == nil {
		out.Destinations = []string{}
	}
	return out
}

// ruleBody is the request-side conversion. An empty port/description is left
// out entirely so Hetzner keeps treating them as "any"/"none" instead of
// receiving "".
func ruleBody(r types.FirewallRule) hetzner.FirewallRuleBody {
	out := hetzner.FirewallRuleBody{
		Direction:      r.Direction,
		Protocol:       r.Protocol,
		SourceIPs:      r.Sources,
		DestinationIPs: r.Destinations,
	}
	if r.Port != "" {
		out.Port = &r.Port
	}
	if r.Description != "" {
		out.Description = &r.Description
	}
	return out
}

func toFirewall(f hetzner.Firewall) types.Firewall {
	out := types.Firewall{
		ID:        f.ID,
		Name:      f.Name,
		Labels:    f.Labels,
		Created:   f.Created,
		Rules:     []types.FirewallRule{},
		AppliedTo: []types.FirewallTarget{},
	}
	for _, r := range f.Rules {
		out.Rules = append(out.Rules, toFirewallRule(r))
	}
	for _, t := range f.AppliedTo {
		view := types.FirewallTarget{Type: t.Type}
		if t.Server != nil {
			view.ServerID = t.Server.ID
		}
		if t.LabelSelector != nil {
			view.Selector = t.LabelSelector.Selector
		}
		out.AppliedTo = append(out.AppliedTo, view)
	}
	return out
}

// Firewalls lists every firewall of the project.
func Firewalls(ctx context.Context) ([]types.Firewall, error) {
	if v, ok := firewallsCache.get("all"); ok {
		return v, nil
	}
	raw, err := hcloud.Firewalls(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]types.Firewall, 0, len(raw))
	for _, f := range raw {
		out = append(out, toFirewall(f))
	}
	firewallsCache.set("all", out, collectionTTL)
	return out, nil
}

// Firewall is one firewall.
func Firewall(ctx context.Context, id int64) (*types.Firewall, error) {
	f, err := hcloud.Firewall(ctx, id)
	if err != nil {
		return nil, err
	}
	out := toFirewall(*f)
	return &out, nil
}

// FirewallCreate creates a firewall, optionally already bound to servers.
func FirewallCreate(ctx context.Context, req types.FirewallCreateRequest) (*types.Firewall, *ActionResult, error) {
	if req.Name == "" {
		return nil, nil, fmt.Errorf("name is required")
	}
	body := hetzner.FirewallCreateRequest{
		Name:   req.Name,
		Labels: req.Labels,
	}
	for _, r := range req.Rules {
		body.Rules = append(body.Rules, ruleBody(r))
	}
	for _, id := range req.ApplyServerIDs {
		body.ApplyTo = append(body.ApplyTo, serverFirewallResource(id))
	}

	res, err := hcloud.FirewallCreate(ctx, body)
	if err != nil {
		return nil, nil, err
	}
	firewallsCache.del("all")

	out := &ActionResult{}
	for _, a := range res.Actions {
		out.Actions = append(out.Actions, actionInfo(a))
	}
	if len(out.Actions) > 0 {
		out.Action = out.Actions[0]
	}
	f := toFirewall(res.Firewall)
	return &f, out, nil
}

// FirewallUpdate renames a firewall and/or replaces its labels.
func FirewallUpdate(ctx context.Context, id int64, name string, labels map[string]string) (*types.Firewall, error) {
	f, err := hcloud.FirewallUpdate(ctx, id, hetzner.FirewallUpdateRequest{Name: name, Labels: labels})
	if err != nil {
		return nil, err
	}
	firewallsCache.del("all")
	out := toFirewall(*f)
	return &out, nil
}

// FirewallDelete removes a firewall and detaches it from every resource.
func FirewallDelete(ctx context.Context, id int64) error {
	if _, err := hcloud.FirewallDelete(ctx, id); err != nil {
		return err
	}
	firewallsCache.del("all")
	return nil
}

// FirewallAction runs one allowlisted firewall action with a typed payload.
func FirewallAction(ctx context.Context, id int64, name string, body map[string]any) (*ActionResult, error) {
	payload, err := firewallPayload(name, body)
	if err != nil {
		return nil, err
	}
	res, err := managedAction(ctx, "firewalls", id, name, payload)
	if err != nil {
		return nil, err
	}
	firewallsCache.del("all")
	return res, nil
}

func firewallPayload(name string, body map[string]any) (any, error) {
	switch name {
	case "set_rules":
		rules, err := firewallRuleBodies(body)
		if err != nil {
			return nil, err
		}
		return struct {
			Rules []hetzner.FirewallRuleBody `json:"rules"`
		}{Rules: rules}, nil

	case "apply_to_resources", "remove_from_resources":
		res, err := firewallResources(body)
		if err != nil {
			return nil, err
		}
		if name == "apply_to_resources" {
			return struct {
				ApplyTo []hetzner.FirewallResource `json:"apply_to"`
			}{ApplyTo: res}, nil
		}
		return struct {
			RemoveFrom []hetzner.FirewallResource `json:"remove_from"`
		}{RemoveFrom: res}, nil

	default:
		return nil, ErrActionNotAllowed
	}
}

// firewallRuleBodies rebuilds rules[] from the generic body with the same
// strictness as a typed struct: each entry must carry direction and protocol.
func firewallRuleBodies(body map[string]any) ([]hetzner.FirewallRuleBody, error) {
	raw, ok := body["rules"]
	if !ok || raw == nil {
		return nil, fmt.Errorf("%w: rules is required", ErrBadField)
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("%w: rules must be an array", ErrBadField)
	}
	out := make([]hetzner.FirewallRuleBody, 0, len(list))
	for _, item := range list {
		entry, ok := item.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%w: each rule must be an object", ErrBadField)
		}
		direction, err := fieldString(entry, "direction", true)
		if err != nil {
			return nil, err
		}
		protocol, err := fieldString(entry, "protocol", true)
		if err != nil {
			return nil, err
		}
		sources, err := fieldStrings(entry, "sources")
		if err != nil {
			return nil, err
		}
		destinations, err := fieldStrings(entry, "destinations")
		if err != nil {
			return nil, err
		}
		port, err := fieldString(entry, "port", false)
		if err != nil {
			return nil, err
		}
		description, err := fieldString(entry, "description", false)
		if err != nil {
			return nil, err
		}
		rule := hetzner.FirewallRuleBody{
			Direction:      direction,
			Protocol:       protocol,
			SourceIPs:      sources,
			DestinationIPs: destinations,
		}
		if port != "" {
			rule.Port = &port
		}
		if description != "" {
			rule.Description = &description
		}
		out = append(out, rule)
	}
	return out, nil
}

// firewallResources turns {"serverIds":[...],"selector":"..."} into the
// apply_to / remove_from entries the API expects.
func firewallResources(body map[string]any) ([]hetzner.FirewallResource, error) {
	ids, err := fieldInt64s(body, "serverIds")
	if err != nil {
		return nil, err
	}
	selector, err := fieldString(body, "selector", false)
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 && selector == "" {
		return nil, fmt.Errorf("%w: serverIds or selector is required", ErrBadField)
	}
	out := make([]hetzner.FirewallResource, 0, len(ids)+1)
	for _, id := range ids {
		out = append(out, serverFirewallResource(id))
	}
	if selector != "" {
		out = append(out, hetzner.FirewallResource{
			Type:          "label_selector",
			LabelSelector: &hetzner.FirewallResourceLabelSelector{Selector: selector},
		})
	}
	return out, nil
}

func serverFirewallResource(id int64) hetzner.FirewallResource {
	return hetzner.FirewallResource{
		Type:   "server",
		Server: &hetzner.FirewallResourceServer{ID: id},
	}
}
