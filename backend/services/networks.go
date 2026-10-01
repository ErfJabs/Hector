package services

import (
	"context"
	"fmt"

	"hector/backend/hetzner"
	"hector/backend/types"
)

// ---- networks ----------------------------------------------------------

func toNetwork(n hetzner.Network) types.Network {
	out := types.Network{
		ID:            n.ID,
		Name:          n.Name,
		IPRange:       n.IPRange,
		Labels:        n.Labels,
		ExposeSwitch:  n.ExposeRoutesToVSwitch,
		ProtectDelete: n.Protection.Delete,
		Created:       n.Created,
		Servers:       n.Servers,
		LoadBalancers: n.LoadBalancers,
	}
	if out.Servers == nil {
		out.Servers = []int64{}
	}
	if out.LoadBalancers == nil {
		out.LoadBalancers = []int64{}
	}
	for _, s := range n.Subnets {
		out.Subnets = append(out.Subnets, types.NetworkSubnet{
			Type:        s.Type,
			IPRange:     s.IPRange,
			NetworkZone: s.NetworkZone,
			Gateway:     s.Gateway,
		})
	}
	if out.Subnets == nil {
		out.Subnets = []types.NetworkSubnet{}
	}
	for _, r := range n.Routes {
		out.Routes = append(out.Routes, types.NetworkRoute{Destination: r.Destination, Gateway: r.Gateway})
	}
	if out.Routes == nil {
		out.Routes = []types.NetworkRoute{}
	}
	return out
}

// Networks lists every private network of the project.
func Networks(ctx context.Context) ([]types.Network, error) {
	if v, ok := networksCache.get("all"); ok {
		return v, nil
	}
	raw, err := hcloud.Networks(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]types.Network, 0, len(raw))
	for _, n := range raw {
		out = append(out, toNetwork(n))
	}
	networksCache.set("all", out, collectionTTL)
	return out, nil
}

// Network is one network with its current member list attached.
func Network(ctx context.Context, id int64) (*types.Network, []types.NetworkMember, error) {
	n, err := hcloud.Network(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	out := toNetwork(*n)

	members, err := hcloud.NetworkMembers(ctx, id)
	if err != nil {
		// Members are decoration for the detail sheet: the network itself is
		// still usable without them.
		return &out, []types.NetworkMember{}, nil
	}
	views := make([]types.NetworkMember, 0, len(members))
	for _, m := range members {
		views = append(views, types.NetworkMember{
			Type:     m.Type,
			ID:       m.ID,
			IP:       m.IP,
			Status:   m.Status,
			AliasIPs: m.AliasIPs,
			Subnet:   m.Subnet,
		})
	}
	return &out, views, nil
}

// NetworkCreate creates a network with one initial subnet so it is usable
// immediately (Hetzner allows a network with no subnet, but nothing can
// attach to it).
func NetworkCreate(ctx context.Context, req types.NetworkCreateRequest) (*types.Network, error) {
	if req.Name == "" || req.IPRange == "" {
		return nil, fmt.Errorf("name and ipRange are required")
	}
	body := hetzner.NetworkCreateRequest{
		Name:    req.Name,
		IPRange: req.IPRange,
		Labels:  req.Labels,
	}
	if req.SubnetIPRange != "" {
		zone := req.SubnetZone
		if zone == "" {
			zone = "eu-central"
		}
		body.Subnets = []hetzner.NetworkSubnet{{
			Type:        "cloud",
			IPRange:     req.SubnetIPRange,
			NetworkZone: zone,
		}}
	}
	res, err := hcloud.NetworkCreate(ctx, body)
	if err != nil {
		return nil, err
	}
	networksCache.del("all")
	out := toNetwork(res.Network)
	return &out, nil
}

// NetworkUpdate renames a network and/or replaces its labels.
func NetworkUpdate(ctx context.Context, id int64, req types.NetworkUpdateRequest) (*types.Network, error) {
	body := hetzner.NetworkUpdateRequest{Name: req.Name, Labels: req.Labels}
	n, err := hcloud.NetworkUpdate(ctx, id, body)
	if err != nil {
		return nil, err
	}
	networksCache.del("all")
	out := toNetwork(*n)
	return &out, nil
}

// NetworkDelete removes a network. Servers attached to it must be detached
// first; Hetzner answers 409 and fail() passes that message through.
func NetworkDelete(ctx context.Context, id int64) (*ActionResult, error) {
	a, err := hcloud.NetworkDelete(ctx, id)
	if err != nil {
		return nil, err
	}
	networksCache.del("all")
	out := &ActionResult{}
	if a != nil {
		out.Action = actionInfo(*a)
		out.Actions = []types.ActionInfo{out.Action}
	}
	return out, nil
}

// NetworkAction runs one allowlisted network action with a typed payload.
func NetworkAction(ctx context.Context, id int64, name string, body map[string]any) (*ActionResult, error) {
	payload, err := networkPayload(name, body)
	if err != nil {
		return nil, err
	}
	res, err := managedAction(ctx, "networks", id, name, payload)
	if err != nil {
		return nil, err
	}
	networksCache.del("all")
	return res, nil
}

func networkPayload(name string, body map[string]any) (any, error) {
	switch name {
	case "add_subnet":
		ipRange, err := fieldString(body, "ipRange", true)
		if err != nil {
			return nil, err
		}
		zone, err := fieldString(body, "networkZone", true)
		if err != nil {
			return nil, err
		}
		typ, err := fieldString(body, "type", false)
		if err != nil {
			return nil, err
		}
		if typ == "" {
			typ = "cloud"
		}
		return struct {
			Type        string `json:"type"`
			IPRange     string `json:"ip_range"`
			NetworkZone string `json:"network_zone"`
		}{Type: typ, IPRange: ipRange, NetworkZone: zone}, nil

	case "delete_subnet":
		ipRange, err := fieldString(body, "ipRange", true)
		if err != nil {
			return nil, err
		}
		return struct {
			IPRange string `json:"ip_range"`
		}{IPRange: ipRange}, nil

	case "add_route", "delete_route":
		dest, err := fieldString(body, "destination", true)
		if err != nil {
			return nil, err
		}
		gateway, err := fieldString(body, "gateway", true)
		if err != nil {
			return nil, err
		}
		return struct {
			Destination string `json:"destination"`
			Gateway     string `json:"gateway"`
		}{Destination: dest, Gateway: gateway}, nil

	case "change_ip_range":
		ipRange, err := fieldString(body, "ipRange", true)
		if err != nil {
			return nil, err
		}
		return struct {
			IPRange string `json:"ip_range"`
		}{IPRange: ipRange}, nil

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
