package services

import (
	"encoding/json"
	"errors"
	"testing"
)

func marshal(t *testing.T, v any) map[string]any {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return out
}

func TestManagedActionRejectsUnknownKind(t *testing.T) {
	if _, err := managedAction(nil, "servers", 1, "reboot", nil); !errors.Is(err, ErrActionNotAllowed) {
		t.Errorf("servers must not reach the generic dispatcher, got %v", err)
	}
	if _, err := managedAction(nil, "volumes", 1, "reboot", nil); !errors.Is(err, ErrActionNotAllowed) {
		t.Errorf("reboot is not a volume action, got %v", err)
	}
	if _, err := managedAction(nil, "", 1, "", nil); !errors.Is(err, ErrActionNotAllowed) {
		t.Errorf("empty kind must be rejected, got %v", err)
	}
}

// TestManagedActionAllowlistIsClosed checks the invariants of the table that
// guards every non-server action endpoint.
func TestManagedActionAllowlistIsClosed(t *testing.T) {
	wantKinds := []string{
		"volumes", "networks", "firewalls", "floating_ips",
		"primary_ips", "load_balancers", "images",
	}
	if len(managedActions) != len(wantKinds) {
		t.Errorf("managedActions covers %d kinds, want %d: %v", len(managedActions), len(wantKinds), managedActions)
	}
	for _, kind := range wantKinds {
		if len(managedActions[kind]) == 0 {
			t.Errorf("%s has an empty allowlist", kind)
		}
	}

	// Server actions have their own allowlist and must not slip into the
	// generic dispatcher (which posts to /servers/{id}/actions).
	if _, ok := managedActions["servers"]; ok {
		t.Error("servers must keep using ServerAction, not the generic dispatcher")
	}
}

func TestVolumePayloadIsStrict(t *testing.T) {
	if _, err := volumePayload("attach", map[string]any{}); !errors.Is(err, ErrBadField) {
		t.Errorf("attach without serverId = %v, want ErrBadField", err)
	}
	if _, err := volumePayload("attach", map[string]any{"serverId": "seven"}); !errors.Is(err, ErrBadField) {
		t.Errorf("string serverId = %v, want ErrBadField", err)
	}
	if _, err := volumePayload("resize", map[string]any{"sizeGb": -1}); !errors.Is(err, ErrBadField) {
		t.Errorf("negative size = %v, want ErrBadField", err)
	}
	if _, err := volumePayload("detach", nil); err != nil {
		t.Errorf("detach needs no body, got %v", err)
	}

	body, err := volumePayload("attach", map[string]any{"serverId": 12, "automount": true})
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	if got := marshal(t, body); got["server"] != float64(12) || got["automount"] != true {
		t.Errorf("attach body = %v", got)
	}
	// automount is omitempty so a plain attach does not force a mount.
	if got := marshal(t, mustPayload(t, "attach", map[string]any{"serverId": 12})); got["automount"] != nil {
		t.Errorf("attach body = %v, want no automount key", got)
	}
}

func mustPayload(t *testing.T, name string, body map[string]any) any {
	t.Helper()
	p, err := volumePayload(name, body)
	if err != nil {
		t.Fatalf("volumePayload(%s): %v", name, err)
	}
	return p
}

func TestFirewallPayloadKeepsWireShape(t *testing.T) {
	body := map[string]any{
		"rules": []any{
			map[string]any{
				"direction": "in",
				"protocol":  "tcp",
				"port":      "443",
				"sources":   []any{"0.0.0.0/0"},
			},
			map[string]any{
				"direction": "out",
				"protocol":  "tcp",
			},
		},
	}
	payload, err := firewallPayload("set_rules", body)
	if err != nil {
		t.Fatalf("set_rules: %v", err)
	}
	got := marshal(t, payload)
	rules, ok := got["rules"].([]any)
	if !ok || len(rules) != 2 {
		t.Fatalf("rules = %v", got["rules"])
	}
	first := rules[0].(map[string]any)
	if first["source_ips"].([]any)[0] != "0.0.0.0/0" {
		t.Errorf("first rule = %v", first)
	}
	second := rules[1].(map[string]any)
	// A rule with no port must omit the key, not send "" (which Hetzner
	// rejects as an invalid port).
	if _, present := second["port"]; present {
		t.Errorf("second rule = %v, want no port key", second)
	}

	if _, err := firewallPayload("set_rules", map[string]any{"rules": "nope"}); !errors.Is(err, ErrBadField) {
		t.Errorf("rules as string = %v, want ErrBadField", err)
	}
	if _, err := firewallPayload("set_rules", map[string]any{}); !errors.Is(err, ErrBadField) {
		t.Errorf("missing rules = %v, want ErrBadField", err)
	}
}

func TestFirewallPayloadApplyAndRemove(t *testing.T) {
	body := map[string]any{"serverIds": []any{1, 2}, "selector": "role=db"}

	apply, err := firewallPayload("apply_to_resources", body)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	got := marshal(t, apply)
	entries := got["apply_to"].([]any)
	if len(entries) != 3 {
		t.Fatalf("apply_to = %v, want two servers plus a selector", entries)
	}
	if entries[0].(map[string]any)["type"] != "server" {
		t.Errorf("first entry = %v", entries[0])
	}
	if entries[2].(map[string]any)["type"] != "label_selector" {
		t.Errorf("selector entry = %v", entries[2])
	}

	remove, err := firewallPayload("remove_from_resources", body)
	if err != nil {
		t.Fatalf("remove: %v", err)
	}
	if _, present := marshal(t, remove)["remove_from"]; !present {
		t.Errorf("remove body = %v, want remove_from", remove)
	}

	if _, err := firewallPayload("apply_to_resources", map[string]any{}); !errors.Is(err, ErrBadField) {
		t.Errorf("empty target = %v, want ErrBadField", err)
	}
}

func TestNetworkPayloadUsesSnakeCase(t *testing.T) {
	got := marshal(t, mustNetworkPayload(t, "add_subnet", map[string]any{
		"ipRange": "10.0.1.0/24", "networkZone": "eu-central",
	}))
	if got["ip_range"] != "10.0.1.0/24" || got["network_zone"] != "eu-central" {
		t.Errorf("add_subnet body = %v", got)
	}
	if got["type"] != "cloud" {
		t.Errorf("type = %v, want the cloud default", got["type"])
	}

	got = marshal(t, mustNetworkPayload(t, "delete_subnet", map[string]any{"ipRange": "10.0.1.0/24"}))
	if len(got) != 1 || got["ip_range"] != "10.0.1.0/24" {
		t.Errorf("delete_subnet body = %v", got)
	}
}

func mustNetworkPayload(t *testing.T, name string, body map[string]any) any {
	t.Helper()
	p, err := networkPayload(name, body)
	if err != nil {
		t.Fatalf("networkPayload(%s): %v", name, err)
	}
	return p
}

func TestIPAddressPayloads(t *testing.T) {
	// floating IPs take a plain server id
	got := marshal(t, mustIPPayload(t, "assign", map[string]any{"server": 5}, "server"))
	if got["server"] != float64(5) {
		t.Errorf("floating assign = %v", got)
	}

	// primary IPs take assignee_id + assignee_type
	got = marshal(t, mustIPPayload(t, "assign", map[string]any{"assignee": 5}, "assignee"))
	if got["assignee_id"] != float64(5) || got["assignee_type"] != "server" {
		t.Errorf("primary assign = %v", got)
	}

	// clearing rDNS sends an explicit null, not ""
	got = marshal(t, mustIPPayload(t, "change_dns_ptr", map[string]any{"ip": "1.2.3.4"}, "server"))
	if v, present := got["dns_ptr"]; !present || v != nil {
		t.Errorf("change_dns_ptr = %v, want dns_ptr null", got)
	}

	if _, err := ipActionPayload("assign", map[string]any{}, "server"); !errors.Is(err, ErrBadField) {
		t.Errorf("assign without an id = %v, want ErrBadField", err)
	}
	if _, err := ipActionPayload("reboot", map[string]any{}, "server"); !errors.Is(err, ErrActionNotAllowed) {
		t.Errorf("unknown ip action = %v, want ErrActionNotAllowed", err)
	}
}

func mustIPPayload(t *testing.T, name string, body map[string]any, key string) any {
	t.Helper()
	p, err := ipActionPayload(name, body, key)
	if err != nil {
		t.Fatalf("ipActionPayload(%s): %v", name, err)
	}
	return p
}

func TestLoadBalancerPayloadValidatesEnums(t *testing.T) {
	if _, err := loadBalancerPayload("change_algorithm", map[string]any{"algorithm": "random"}); !errors.Is(err, ErrBadField) {
		t.Errorf("bad algorithm = %v, want ErrBadField", err)
	}
	if _, err := loadBalancerPayload("change_type", map[string]any{}); !errors.Is(err, ErrBadField) {
		t.Errorf("missing type = %v, want ErrBadField", err)
	}

	got := marshal(t, mustLBPayload(t, "change_algorithm", map[string]any{"algorithm": "least_conn"}))
	if got["type"] != "least_conn" {
		t.Errorf("change_algorithm = %v", got)
	}

	// target types are a closed set
	if _, err := loadBalancerPayload("add_target", map[string]any{"type": "magic"}); !errors.Is(err, ErrBadField) {
		t.Errorf("bad target type = %v, want ErrBadField", err)
	}
	if _, err := loadBalancerPayload("add_target", map[string]any{"type": "server"}); !errors.Is(err, ErrBadField) {
		t.Errorf("server target without an id = %v, want ErrBadField", err)
	}

	target := marshal(t, mustLBPayload(t, "add_target", map[string]any{"type": "server", "serverId": 4}))
	if target["server"].(map[string]any)["id"] != float64(4) {
		t.Errorf("add_target = %v", target)
	}

	svc := marshal(t, mustLBPayload(t, "add_service", map[string]any{
		"protocol": "tcp", "listenPort": 8080, "destinationPort": 80,
	}))
	if svc["listen_port"] != float64(8080) || svc["destination_port"] != float64(80) {
		t.Errorf("add_service = %v", svc)
	}

	if _, err := loadBalancerPayload("add_service", map[string]any{"protocol": "smtp"}); !errors.Is(err, ErrBadField) {
		t.Errorf("bad protocol = %v, want ErrBadField", err)
	}
	if _, err := loadBalancerPayload("unknown", map[string]any{}); !errors.Is(err, ErrActionNotAllowed) {
		t.Errorf("unknown action = %v, want ErrActionNotAllowed", err)
	}
}

func mustLBPayload(t *testing.T, name string, body map[string]any) any {
	t.Helper()
	p, err := loadBalancerPayload(name, body)
	if err != nil {
		t.Fatalf("loadBalancerPayload(%s): %v", name, err)
	}
	return p
}

func TestFieldReadersRejectWrongShapes(t *testing.T) {
	if _, err := fieldString(map[string]any{"n": 1}, "n", false); !errors.Is(err, ErrBadField) {
		t.Errorf("string from number = %v", err)
	}
	if _, err := fieldInt64(map[string]any{"n": "1"}, "n", false); !errors.Is(err, ErrBadField) {
		t.Errorf("number from string = %v", err)
	}
	if _, err := fieldBool(map[string]any{"b": "yes"}, "b"); !errors.Is(err, ErrBadField) {
		t.Errorf("bool from string = %v", err)
	}
	if _, err := fieldStrings(map[string]any{"s": []any{"a", 1}}, "s"); !errors.Is(err, ErrBadField) {
		t.Errorf("string array with a number = %v", err)
	}
	if _, err := fieldInt64s(map[string]any{"n": []any{"1"}}, "n"); !errors.Is(err, ErrBadField) {
		t.Errorf("number array with strings = %v", err)
	}

	// optional fields return the zero value without an error
	if s, err := fieldString(map[string]any{}, "missing", false); err != nil || s != "" {
		t.Errorf("optional string = %q/%v", s, err)
	}
	if b, err := fieldBool(map[string]any{}, "missing"); err != nil || b {
		t.Errorf("optional bool = %v/%v", b, err)
	}
}
