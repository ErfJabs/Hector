package services

import (
	"context"
	"fmt"

	"hector/backend/hetzner"
	"hector/backend/types"
)

// ---- floating IPs ------------------------------------------------------

func floatingDNS(entries []hetzner.FloatingIPDNSPtr) []types.IPDNSEntry {
	out := make([]types.IPDNSEntry, 0, len(entries))
	for _, e := range entries {
		out = append(out, types.IPDNSEntry{IP: e.IP, DNSPtr: e.DNSPtr})
	}
	return out
}

func toFloatingIP(f hetzner.FloatingIP) types.FloatingIP {
	out := types.FloatingIP{
		ID:            f.ID,
		Name:          f.Name,
		IP:            f.IP,
		Type:          f.Type,
		ServerID:      f.Server,
		HomeLocation:  locationInfo(f.HomeLocation),
		DNS:           floatingDNS(f.DNSPtr),
		Blocked:       f.Blocked,
		ProtectDelete: f.Protection.Delete,
		Labels:        f.Labels,
		Created:       f.Created,
	}
	if f.Description != nil {
		out.Description = *f.Description
	}
	return out
}

// FloatingIPs lists every floating IP of the project.
func FloatingIPs(ctx context.Context) ([]types.FloatingIP, error) {
	if v, ok := floatingIPsCache.get("all"); ok {
		return v, nil
	}
	raw, err := hcloud.FloatingIPs(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]types.FloatingIP, 0, len(raw))
	for _, f := range raw {
		out = append(out, toFloatingIP(f))
	}
	floatingIPsCache.set("all", out, collectionTTL)
	return out, nil
}

// FloatingIP is one floating IP.
func FloatingIP(ctx context.Context, id int64) (*types.FloatingIP, error) {
	f, err := hcloud.FloatingIP(ctx, id)
	if err != nil {
		return nil, err
	}
	out := toFloatingIP(*f)
	return &out, nil
}

// FloatingIPCreate allocates a floating IP, optionally assigned to a server.
func FloatingIPCreate(ctx context.Context, req types.FloatingIPCreateRequest) (*types.FloatingIP, *ActionResult, error) {
	if req.Name == "" || req.Type == "" || req.Location == "" {
		return nil, nil, fmt.Errorf("name, type and location are required")
	}
	if req.Type != "ipv4" && req.Type != "ipv6" {
		return nil, nil, fmt.Errorf("%w: type must be ipv4 or ipv6", ErrBadField)
	}
	body := hetzner.FloatingIPCreateRequest{
		Type:         req.Type,
		HomeLocation: &hetzner.IDOrName{Name: locationSlug(req.Location)},
		Server:       req.ServerID,
		Labels:       req.Labels,
	}
	if req.Name != "" {
		name := req.Name
		body.Name = &name
	}
	if req.Description != "" {
		desc := req.Description
		body.Description = &desc
	}

	res, err := hcloud.FloatingIPCreate(ctx, body)
	if err != nil {
		return nil, nil, err
	}
	floatingIPsCache.del("all")

	out := &ActionResult{}
	if res.Action != nil {
		out.Actions = []types.ActionInfo{actionInfo(*res.Action)}
		out.Action = out.Actions[0]
	}
	f := toFloatingIP(res.FloatingIP)
	return &f, out, nil
}

// FloatingIPUpdate renames, relabels and rewrites the description.
func FloatingIPUpdate(ctx context.Context, id int64, name, description string, labels map[string]string) (*types.FloatingIP, error) {
	body := hetzner.FloatingIPUpdateRequest{Name: name, Description: description, Labels: labels}
	f, err := hcloud.FloatingIPUpdate(ctx, id, body)
	if err != nil {
		return nil, err
	}
	floatingIPsCache.del("all")
	out := toFloatingIP(*f)
	return &out, nil
}

// FloatingIPDelete releases a floating IP.
func FloatingIPDelete(ctx context.Context, id int64) (*ActionResult, error) {
	a, err := hcloud.FloatingIPDelete(ctx, id)
	if err != nil {
		return nil, err
	}
	floatingIPsCache.del("all")
	out := &ActionResult{}
	if a != nil {
		out.Action = actionInfo(*a)
		out.Actions = []types.ActionInfo{out.Action}
	}
	return out, nil
}

// FloatingIPAction runs one allowlisted floating IP action.
func FloatingIPAction(ctx context.Context, id int64, name string, body map[string]any) (*ActionResult, error) {
	payload, err := ipActionPayload(name, body, "server")
	if err != nil {
		return nil, err
	}
	res, err := managedAction(ctx, "floating_ips", id, name, payload)
	if err != nil {
		return nil, err
	}
	floatingIPsCache.del("all")
	return res, nil
}

// ---- primary IPs -------------------------------------------------------

func primaryDNS(entries []hetzner.PrimaryIPDNSPtr) []types.IPDNSEntry {
	out := make([]types.IPDNSEntry, 0, len(entries))
	for _, e := range entries {
		out = append(out, types.IPDNSEntry{IP: e.IP, DNSPtr: e.DNSPtr})
	}
	return out
}

func toPrimaryIP(p hetzner.PrimaryIP) types.PrimaryIP {
	return types.PrimaryIP{
		ID:            p.ID,
		Name:          p.Name,
		IP:            p.IP,
		Type:          p.Type,
		AssigneeID:    p.AssigneeID,
		AssigneeType:  p.AssigneeType,
		AutoDelete:    p.AutoDelete,
		Location:      locationInfo(p.Location),
		DNS:           primaryDNS(p.DNSPtr),
		Blocked:       p.Blocked,
		ProtectDelete: p.Protection.Delete,
		Labels:        p.Labels,
		Created:       p.Created,
	}
}

// PrimaryIPs lists every primary IP of the project.
func PrimaryIPs(ctx context.Context) ([]types.PrimaryIP, error) {
	if v, ok := primaryIPsCache.get("all"); ok {
		return v, nil
	}
	raw, err := hcloud.PrimaryIPs(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]types.PrimaryIP, 0, len(raw))
	for _, p := range raw {
		out = append(out, toPrimaryIP(p))
	}
	primaryIPsCache.set("all", out, collectionTTL)
	return out, nil
}

// PrimaryIP is one primary IP.
func PrimaryIP(ctx context.Context, id int64) (*types.PrimaryIP, error) {
	p, err := hcloud.PrimaryIP(ctx, id)
	if err != nil {
		return nil, err
	}
	out := toPrimaryIP(*p)
	return &out, nil
}

// PrimaryIPCreate allocates a primary IP.
func PrimaryIPCreate(ctx context.Context, req types.PrimaryIPCreateRequest) (*types.PrimaryIP, *ActionResult, error) {
	if req.Name == "" || req.Type == "" || req.Location == "" {
		return nil, nil, fmt.Errorf("name, type and location are required")
	}
	if req.Type != "ipv4" && req.Type != "ipv6" {
		return nil, nil, fmt.Errorf("%w: type must be ipv4 or ipv6", ErrBadField)
	}
	body := hetzner.PrimaryIPCreateRequest{
		Name:         req.Name,
		Type:         req.Type,
		Location:     locationSlug(req.Location),
		AssigneeType: req.AssigneeType,
		AssigneeID:   req.AssigneeID,
		Labels:       req.Labels,
		AutoDelete:   &req.AutoDelete,
	}
	res, err := hcloud.PrimaryIPCreate(ctx, body)
	if err != nil {
		return nil, nil, err
	}
	primaryIPsCache.del("all")

	out := &ActionResult{}
	if res.Action != nil {
		out.Actions = []types.ActionInfo{actionInfo(*res.Action)}
		out.Action = out.Actions[0]
	}
	p := toPrimaryIP(res.PrimaryIP)
	return &p, out, nil
}

// PrimaryIPUpdate renames, relabels and toggles auto-delete.
func PrimaryIPUpdate(ctx context.Context, id int64, name string, labels map[string]string, autoDelete bool) (*types.PrimaryIP, error) {
	body := hetzner.PrimaryIPUpdateRequest{Name: name, Labels: labels, AutoDelete: &autoDelete}
	p, err := hcloud.PrimaryIPUpdate(ctx, id, body)
	if err != nil {
		return nil, err
	}
	primaryIPsCache.del("all")
	out := toPrimaryIP(*p)
	return &out, nil
}

// PrimaryIPDelete releases a primary IP.
func PrimaryIPDelete(ctx context.Context, id int64) (*ActionResult, error) {
	a, err := hcloud.PrimaryIPDelete(ctx, id)
	if err != nil {
		return nil, err
	}
	primaryIPsCache.del("all")
	out := &ActionResult{}
	if a != nil {
		out.Action = actionInfo(*a)
		out.Actions = []types.ActionInfo{out.Action}
	}
	return out, nil
}

// PrimaryIPAction runs one allowlisted primary IP action.
func PrimaryIPAction(ctx context.Context, id int64, name string, body map[string]any) (*ActionResult, error) {
	payload, err := ipActionPayload(name, body, "assignee")
	if err != nil {
		return nil, err
	}
	res, err := managedAction(ctx, "primary_ips", id, name, payload)
	if err != nil {
		return nil, err
	}
	primaryIPsCache.del("all")
	return res, nil
}

// ipActionPayload builds the shared assign/unassign/change_dns_ptr/
// change_protection bodies for both IP kinds. assigneeKey is the id field
// name the panel uses ("server" for floating IPs, "assignee" for primary).
func ipActionPayload(name string, body map[string]any, assigneeKey string) (any, error) {
	switch name {
	case "assign":
		id, err := fieldInt64(body, assigneeKey, true)
		if err != nil {
			return nil, err
		}
		if assigneeKey == "server" {
			return struct {
				Server int64 `json:"server"`
			}{Server: id}, nil
		}
		typ, err := fieldString(body, "assigneeType", false)
		if err != nil {
			return nil, err
		}
		if typ == "" {
			typ = "server"
		}
		return struct {
			AssigneeID   int64  `json:"assignee_id"`
			AssigneeType string `json:"assignee_type"`
		}{AssigneeID: id, AssigneeType: typ}, nil

	case "unassign":
		return struct{}{}, nil

	case "change_dns_ptr":
		ip, err := fieldString(body, "ip", true)
		if err != nil {
			return nil, err
		}
		ptr, err := fieldString(body, "dnsPtr", false)
		if err != nil {
			return nil, err
		}
		var dnsPtr *string
		if ptr != "" {
			dnsPtr = &ptr
		}
		return struct {
			IP     string  `json:"ip"`
			DNSPtr *string `json:"dns_ptr"`
		}{IP: ip, DNSPtr: dnsPtr}, nil

	case "change_protection":
		protect, err := fieldBool(body, "protect")
		if err != nil {
			return nil, err
		}
		return struct {
			Delete bool `json:"delete"`
		}{Delete: protect}, nil

	default:
		return nil, ErrActionNotAllowed
	}
}
