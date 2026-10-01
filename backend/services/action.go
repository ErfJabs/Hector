package services

import (
	"context"
	"fmt"

	"hector/backend/hetzner"
)

// ErrBadField reports a request body that is syntactically valid JSON but
// carries a value of the wrong shape (a string where an id is expected).
var ErrBadField = fmt.Errorf("invalid field")

// managedActions is the exact set of Hetzner actions this panel exposes per
// resource kind. Anything else answers 400 action_not_allowed — the frontend
// cannot reach an endpoint the panel never intended to publish.
var managedActions = map[string]map[string]bool{
	"volumes": {
		"attach":            true,
		"detach":            true,
		"resize":            true,
		"change_protection": true,
	},
	"networks": {
		"add_subnet":        true,
		"delete_subnet":     true,
		"add_route":         true,
		"delete_route":      true,
		"change_ip_range":   true,
		"change_protection": true,
	},
	"firewalls": {
		"set_rules":             true,
		"apply_to_resources":    true,
		"remove_from_resources": true,
	},
	"floating_ips": {
		"assign":            true,
		"unassign":          true,
		"change_dns_ptr":    true,
		"change_protection": true,
	},
	"primary_ips": {
		"assign":            true,
		"unassign":          true,
		"change_dns_ptr":    true,
		"change_protection": true,
	},
	"load_balancers": {
		"add_target":               true,
		"remove_target":            true,
		"add_service":              true,
		"update_service":           true,
		"delete_service":           true,
		"change_algorithm":         true,
		"change_type":              true,
		"change_protection":        true,
		"attach_to_network":        true,
		"detach_from_network":      true,
		"enable_public_interface":  true,
		"disable_public_interface": true,
	},
	"images": {
		"change_protection": true,
	},
}

// managedAction POSTs one allowlisted action and converts the response into
// the panel's action view. Firewall rule/apply endpoints answer with a list
// of actions instead of one, so every row is returned.
func managedAction(ctx context.Context, kind string, id int64, name string, payload any) (*ActionResult, error) {
	allow := managedActions[kind]
	if allow == nil || !allow[name] {
		return nil, ErrActionNotAllowed
	}

	var res *hetzner.ActionResponse
	var err error
	switch kind {
	case "volumes":
		res, err = hcloud.DoVolumeAction(ctx, id, name, payload)
	case "networks":
		res, err = hcloud.DoNetworkAction(ctx, id, name, payload)
	case "firewalls":
		res, err = hcloud.DoFirewallAction(ctx, id, name, payload)
	case "floating_ips":
		res, err = hcloud.DoFloatingIPAction(ctx, id, name, payload)
	case "primary_ips":
		res, err = hcloud.DoPrimaryIPAction(ctx, id, name, payload)
	case "load_balancers":
		res, err = hcloud.DoLoadBalancerAction(ctx, id, name, payload)
	case "images":
		res, err = hcloud.DoImageAction(ctx, id, name, payload)
	default:
		return nil, ErrActionNotAllowed
	}
	if err != nil {
		return nil, err
	}

	out := &ActionResult{}
	for _, a := range res.All() {
		out.Actions = append(out.Actions, actionInfo(a))
	}
	out.Action = out.Actions[0]
	return out, nil
}

// ---- strict body readers ------------------------------------------------
//
// A request body arrives as map[string]any. Forwarding that verbatim would
// let a caller send "server": "abc" (or an unexpected field) straight to
// Hetzner. Every action payload is therefore rebuilt from typed readers.

func fieldString(body map[string]any, key string, required bool) (string, error) {
	raw, ok := body[key]
	if !ok || raw == nil {
		if required {
			return "", fmt.Errorf("%w: %s is required", ErrBadField, key)
		}
		return "", nil
	}
	v, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("%w: %s must be a string", ErrBadField, key)
	}
	if required && v == "" {
		return "", fmt.Errorf("%w: %s is required", ErrBadField, key)
	}
	return v, nil
}

func fieldInt64(body map[string]any, key string, required bool) (int64, error) {
	raw, ok := body[key]
	if !ok || raw == nil {
		if required {
			return 0, fmt.Errorf("%w: %s is required", ErrBadField, key)
		}
		return 0, nil
	}
	switch v := raw.(type) {
	case float64:
		return int64(v), nil
	case int64:
		return v, nil
	case int:
		return int64(v), nil
	default:
		return 0, fmt.Errorf("%w: %s must be a number", ErrBadField, key)
	}
}

func fieldBool(body map[string]any, key string) (bool, error) {
	raw, ok := body[key]
	if !ok || raw == nil {
		return false, nil
	}
	v, ok := raw.(bool)
	if !ok {
		return false, fmt.Errorf("%w: %s must be a boolean", ErrBadField, key)
	}
	return v, nil
}

func fieldStrings(body map[string]any, key string) ([]string, error) {
	raw, ok := body[key]
	if !ok || raw == nil {
		return nil, nil
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("%w: %s must be an array of strings", ErrBadField, key)
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		s, ok := item.(string)
		if !ok {
			return nil, fmt.Errorf("%w: %s must be an array of strings", ErrBadField, key)
		}
		out = append(out, s)
	}
	return out, nil
}

func fieldInt64s(body map[string]any, key string) ([]int64, error) {
	raw, ok := body[key]
	if !ok || raw == nil {
		return nil, nil
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("%w: %s must be an array of numbers", ErrBadField, key)
	}
	out := make([]int64, 0, len(list))
	for _, item := range list {
		switch v := item.(type) {
		case float64:
			out = append(out, int64(v))
		case int64:
			out = append(out, v)
		case int:
			out = append(out, int64(v))
		default:
			return nil, fmt.Errorf("%w: %s must be an array of numbers", ErrBadField, key)
		}
	}
	return out, nil
}
