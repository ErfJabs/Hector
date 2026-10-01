package services

import (
	"context"
	"fmt"

	"hector/backend/hetzner"
	"hector/backend/types"
)

// ---- load balancers ----------------------------------------------------

func toLoadBalancer(lb hetzner.LoadBalancer) types.LoadBalancer {
	out := types.LoadBalancer{
		ID:            lb.ID,
		Name:          lb.Name,
		Type:          lb.LoadBalancerType.Name,
		Location:      locationInfo(lb.Location),
		Algorithm:     lb.Algorithm.Type,
		IPv4:          lb.PublicNet.IPv4.IP,
		IPv6:          lb.PublicNet.IPv6.IP,
		PublicEnabled: lb.PublicNet.Enabled,
		Labels:        lb.Labels,
		ProtectDelete: lb.Protection.Delete,
		Created:       lb.Created,
		Services:      []types.LBService{},
		Targets:       []types.LBTarget{},
	}

	for _, s := range lb.Services {
		view := types.LBService{
			Protocol:        s.Protocol,
			ListenPort:      s.ListenPort,
			DestinationPort: s.DestinationPort,
			ProxyProtocol:   s.Proxyprotocol,
		}
		if s.HTTP != nil {
			view.Certificates = s.HTTP.Certificates
			view.RedirectHTTP = s.HTTP.RedirectHTTP
			view.StickySessions = s.HTTP.StickySessions
		}
		if view.Certificates == nil {
			view.Certificates = []int64{}
		}
		out.Services = append(out.Services, view)
	}

	for _, t := range lb.Targets {
		view := types.LBTarget{
			Type:         t.Type,
			UsePrivateIP: t.UsePrivateIP,
		}
		if t.Server != nil {
			view.ServerID = t.Server.ID
		}
		if t.LabelSelector != nil {
			view.Selector = t.LabelSelector.Selector
		}
		if t.IP != nil {
			view.IP = t.IP.IP
		}
		for _, h := range t.HealthStatus {
			view.HealthStatus = append(view.HealthStatus, types.LBHealth{ListenPort: h.ListenPort, Status: h.Status})
		}
		if view.HealthStatus == nil {
			view.HealthStatus = []types.LBHealth{}
		}
		out.Targets = append(out.Targets, view)
	}
	return out
}

// LoadBalancers lists every load balancer of the project.
func LoadBalancers(ctx context.Context) ([]types.LoadBalancer, error) {
	if v, ok := loadBalancersCache.get("all"); ok {
		return v, nil
	}
	raw, err := hcloud.LoadBalancers(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]types.LoadBalancer, 0, len(raw))
	for _, lb := range raw {
		out = append(out, toLoadBalancer(lb))
	}
	loadBalancersCache.set("all", out, collectionTTL)
	return out, nil
}

// LoadBalancer is one load balancer with its recent actions attached, so the
// detail sheet opens in a single request.
func LoadBalancer(ctx context.Context, id int64) (*types.LoadBalancer, error) {
	lb, err := hcloud.LoadBalancer(ctx, id)
	if err != nil {
		return nil, err
	}
	out := toLoadBalancer(*lb)

	if actions, total, err := hcloud.LoadBalancerActions(ctx, id, 12); err == nil {
		out.ActionsTotal = total
		for _, a := range actions {
			out.Actions = append(out.Actions, actionInfo(a))
		}
	}
	return &out, nil
}

// LoadBalancerCreate provisions a load balancer. Hetzner creates it in one
// call; the returned action runs in the background.
func LoadBalancerCreate(ctx context.Context, req types.LoadBalancerCreateRequest) (*types.LoadBalancer, *ActionResult, error) {
	if req.Name == "" || req.Type == "" || req.Location == "" {
		return nil, nil, fmt.Errorf("name, type and location are required")
	}
	algorithm := req.Algorithm
	if algorithm == "" {
		algorithm = "round_robin"
	}
	body := hetzner.LoadBalancerCreateRequest{
		Name:             req.Name,
		LoadBalancerType: hetzner.IDOrName{Name: req.Type},
		Algorithm:        &hetzner.LoadBalancerAlgorithm{Type: algorithm},
		Location:         optionalString(locationSlug(req.Location)),
		Labels:           req.Labels,
	}
	res, err := hcloud.LoadBalancerCreate(ctx, body)
	if err != nil {
		return nil, nil, err
	}
	loadBalancersCache.del("all")

	out := &ActionResult{Action: actionInfo(res.Action), Actions: []types.ActionInfo{actionInfo(res.Action)}}
	lb := toLoadBalancer(res.LoadBalancer)
	return &lb, out, nil
}

// LoadBalancerUpdate renames a load balancer and/or replaces its labels.
func LoadBalancerUpdate(ctx context.Context, id int64, name string, labels map[string]string) (*types.LoadBalancer, error) {
	lb, err := hcloud.LoadBalancerUpdate(ctx, id, hetzner.LoadBalancerUpdateRequest{Name: name, Labels: labels})
	if err != nil {
		return nil, err
	}
	loadBalancersCache.del("all")
	out := toLoadBalancer(*lb)
	return &out, nil
}

// LoadBalancerDelete removes a load balancer.
func LoadBalancerDelete(ctx context.Context, id int64) (*ActionResult, error) {
	a, err := hcloud.LoadBalancerDelete(ctx, id)
	if err != nil {
		return nil, err
	}
	loadBalancersCache.del("all")
	out := &ActionResult{}
	if a != nil {
		out.Action = actionInfo(*a)
		out.Actions = []types.ActionInfo{out.Action}
	}
	return out, nil
}

// LoadBalancerAction runs one allowlisted load balancer action.
func LoadBalancerAction(ctx context.Context, id int64, name string, body map[string]any) (*ActionResult, error) {
	payload, err := loadBalancerPayload(name, body)
	if err != nil {
		return nil, err
	}
	res, err := managedAction(ctx, "load_balancers", id, name, payload)
	if err != nil {
		return nil, err
	}
	loadBalancersCache.del("all")
	return res, nil
}

func loadBalancerPayload(name string, body map[string]any) (any, error) {
	switch name {
	case "add_target", "remove_target":
		return lbTargetBody(body)

	case "add_service", "update_service":
		return lbServiceBody(name, body)

	case "delete_service":
		port, err := fieldInt64(body, "listenPort", true)
		if err != nil {
			return nil, err
		}
		return struct {
			ListenPort int64 `json:"listen_port"`
		}{ListenPort: port}, nil

	case "change_algorithm":
		typ, err := fieldString(body, "algorithm", true)
		if err != nil {
			return nil, err
		}
		if typ != "round_robin" && typ != "least_conn" {
			return nil, fmt.Errorf("%w: algorithm must be round_robin or least_conn", ErrBadField)
		}
		return struct {
			Type string `json:"type"`
		}{Type: typ}, nil

	case "change_type":
		typ, err := fieldString(body, "type", true)
		if err != nil {
			return nil, err
		}
		return struct {
			LoadBalancerType hetzner.IDOrName `json:"load_balancer_type"`
		}{LoadBalancerType: hetzner.IDOrName{Name: typ}}, nil

	case "change_protection":
		protect, err := fieldBool(body, "protect")
		if err != nil {
			return nil, err
		}
		return struct {
			Delete bool `json:"delete"`
		}{Delete: protect}, nil

	case "attach_to_network":
		network, err := fieldInt64(body, "networkId", true)
		if err != nil {
			return nil, err
		}
		ip, err := fieldString(body, "ip", false)
		if err != nil {
			return nil, err
		}
		out := struct {
			Network int64   `json:"network"`
			IP      *string `json:"ip,omitempty"`
		}{Network: network}
		if ip != "" {
			out.IP = &ip
		}
		return out, nil

	case "detach_from_network":
		network, err := fieldInt64(body, "networkId", true)
		if err != nil {
			return nil, err
		}
		return struct {
			Network int64 `json:"network"`
		}{Network: network}, nil

	case "enable_public_interface", "disable_public_interface":
		return struct{}{}, nil

	default:
		return nil, ErrActionNotAllowed
	}
}

func lbTargetBody(body map[string]any) (any, error) {
	typ, err := fieldString(body, "type", true)
	if err != nil {
		return nil, err
	}
	out := hetzner.LBTargetBody{Type: typ}
	switch typ {
	case "server":
		id, err := fieldInt64(body, "serverId", true)
		if err != nil {
			return nil, err
		}
		out.Server = &hetzner.LoadBalancerTargetServer{ID: id}
	case "label_selector":
		selector, err := fieldString(body, "selector", true)
		if err != nil {
			return nil, err
		}
		out.LabelSelector = &hetzner.LoadBalancerTargetLabelSelector{Selector: selector}
	case "ip":
		ip, err := fieldString(body, "ip", true)
		if err != nil {
			return nil, err
		}
		out.IP = &hetzner.LoadBalancerTargetIP{IP: ip}
	default:
		return nil, fmt.Errorf("%w: type must be server, label_selector or ip", ErrBadField)
	}
	// use_private_ip only makes sense for server/label_selector targets; the
	// API ignores it for ip targets, so sending it is harmless either way.
	if private, err := fieldBool(body, "usePrivateIp"); err == nil && private {
		out.UsePrivateIP = &private
	}
	return out, nil
}

func lbServiceBody(action string, body map[string]any) (any, error) {
	protocol, err := fieldString(body, "protocol", true)
	if err != nil {
		return nil, err
	}
	switch protocol {
	case "http", "https", "tcp", "proxyproto":
	default:
		return nil, fmt.Errorf("%w: protocol must be http, https, tcp or proxyproto", ErrBadField)
	}

	listenPort, err := fieldInt64(body, "listenPort", action == "update_service")
	if err != nil {
		return nil, err
	}
	destPort, err := fieldInt64(body, "destinationPort", false)
	if err != nil {
		return nil, err
	}
	redirect, err := fieldBool(body, "redirectHttp")
	if err != nil {
		return nil, err
	}
	sticky, err := fieldBool(body, "stickySessions")
	if err != nil {
		return nil, err
	}
	certs, err := fieldInt64s(body, "certificateIds")
	if err != nil {
		return nil, err
	}

	// The API wants pointer fields so an omitted value means "leave as is"
	// on update and "default" on create.
	lp, dp := listenPort, destPort
	out := struct {
		Protocol        string `json:"protocol"`
		ListenPort      *int64 `json:"listen_port,omitempty"`
		DestinationPort *int64 `json:"destination_port,omitempty"`
		HTTP            *struct {
			Certificates   *[]int64 `json:"certificates,omitempty"`
			RedirectHTTP   *bool    `json:"redirect_http,omitempty"`
			StickySessions *bool    `json:"sticky_sessions,omitempty"`
		} `json:"http,omitempty"`
	}{Protocol: protocol}

	if lp > 0 {
		out.ListenPort = &lp
	}
	if dp > 0 {
		out.DestinationPort = &dp
	}
	if (protocol == "http" || protocol == "https") && (len(certs) > 0 || redirect || sticky) {
		http := &struct {
			Certificates   *[]int64 `json:"certificates,omitempty"`
			RedirectHTTP   *bool    `json:"redirect_http,omitempty"`
			StickySessions *bool    `json:"sticky_sessions,omitempty"`
		}{RedirectHTTP: &redirect, StickySessions: &sticky}
		if len(certs) > 0 {
			http.Certificates = &certs
		}
		out.HTTP = http
	}
	return out, nil
}
