package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"hector/backend/hetzner"
	"hector/backend/types"
)

// ErrActionNotAllowed guards the action pass-through: the frontend can only
// call the Hetzner actions this panel actually exposes.
var ErrActionNotAllowed = errors.New("action not allowed")

var allowedActions = map[string]bool{
	"poweron":           true,
	"poweroff":          true,
	"shutdown":          true,
	"reboot":            true,
	"reset":             true,
	"rebuild":           true,
	"enable_rescue":     true,
	"disable_rescue":    true,
	"reset_password":    true,
	"attach_iso":        true,
	"detach_iso":        true,
	"change_dns_ptr":    true,
	"enable_backup":     true,
	"disable_backup":    true,
	"create_image":      true,
	"change_protection": true,
	"change_type":       true,
}

// Server returns the full detail view of one server.
func Server(ctx context.Context, id int64) (*types.ServerDetail, error) {
	s, err := hcloud.Server(ctx, id)
	if err != nil {
		return nil, err
	}

	idx, _ := prices(ctx)

	detail := &types.ServerDetail{
		FleetItem:  toFleetItem(*s, idx, hetzner.Action{}, nil),
		Datacenter: datacenterName(*s),
	}
	extras := serverExtras(ctx, *s)
	detail.RDNS = extras.RDNS
	detail.Actions = extras.Actions
	detail.ActionsTotal = extras.ActionsTotal
	detail.OnSince = extras.OnSince
	detail.Busy = extras.Item.Busy

	// CPU sparkline for the overview section; failures degrade to no chart.
	if s.Status == "running" {
		now := time.Now().UTC()
		if m, err := hcloud.ServerMetrics(ctx, id, []string{"cpu"}, now.Add(-time.Hour), now, 300); err == nil {
			if vals := series(m, "cpu"); len(vals) > 0 {
				// Hetzner sums CPU across cores (a 12-core box can report 175%);
				// divide here too, so the first paint from this payload matches
				// the polled metrics charts instead of flashing tall-then-short.
				if s.ServerType.Cores > 0 {
					vals = scale(vals, 1/float64(s.ServerType.Cores))
				}
				detail.CPU = &types.CPUInfo{Now: vals[len(vals)-1], Series: vals}
			}
		}
	}

	return detail, nil
}

// serverExtras collects the detail-only parts of a server: rDNS rows,
// recent actions, the "on for" clock and a fresh base item. Shared by the
// detail view and the metrics extras so the two can never disagree.
func serverExtras(ctx context.Context, s hetzner.Server) *types.MetricsExtras {
	idx, _ := prices(ctx)
	x := &types.MetricsExtras{Item: toFleetItem(s, idx, hetzner.Action{}, nil)}

	if s.PublicNet.IPv4 != nil {
		dnsPtr := ""
		if s.PublicNet.IPv4.DNSPtr != nil {
			dnsPtr = *s.PublicNet.IPv4.DNSPtr
		}
		x.RDNS = append(x.RDNS, types.RDNSRow{Family: "IPv4", IP: s.PublicNet.IPv4.IP, DNSPtr: dnsPtr})
	}
	if s.PublicNet.IPv6 != nil {
		for _, entry := range s.PublicNet.IPv6.DNSPtr {
			x.RDNS = append(x.RDNS, types.RDNSRow{Family: "IPv6", IP: entry.IP, DNSPtr: entry.DNSPtr})
		}
	}
	// IPv6 without any PTR rows still deserves an editable row.
	if s.PublicNet.IPv6 != nil && len(s.PublicNet.IPv6.DNSPtr) == 0 {
		x.RDNS = append(x.RDNS, types.RDNSRow{Family: "IPv6", IP: strings.Split(s.PublicNet.IPv6.IP, "/")[0]})
	}

	// Lifecycle: recent actions + the "on for" clock. "On for" is the time
	// since the last action that started the server; reboots from inside
	// the guest OS are invisible to the API (foundations: no uptime lie).
	if actions, total, err := hcloud.ServerActions(ctx, s.ID, 12); err == nil {
		x.ActionsTotal = total
		for _, a := range actions {
			x.Actions = append(x.Actions, actionInfo(a))
			if x.OnSince == nil && a.Status == "success" {
				switch a.Command {
				case "start_server", "reboot_server", "reset_server", "create_server":
					at := a.Started
					if a.Finished != nil {
						at = *a.Finished
					}
					x.OnSince = &at
				}
			}
			if x.Item.Busy == nil && a.Status == "running" {
				x.Item.Busy = &types.Busy{Command: a.Command, Progress: a.Progress}
			}
		}
	}
	return x
}

// ServerRename renames a server (PUT /servers/{id}).
func ServerRename(ctx context.Context, id int64, name string) (*types.ServerDetail, error) {
	if _, err := hcloud.ServerUpdate(ctx, id, hetzner.ServerUpdateRequest{Name: name}); err != nil {
		return nil, err
	}
	return Server(ctx, id)
}

// ServerLabels replaces the labels of a server (PUT /servers/{id}).
func ServerLabels(ctx context.Context, id int64, labels map[string]string) (*types.ServerDetail, error) {
	if labels == nil {
		labels = map[string]string{}
	}
	if _, err := hcloud.ServerUpdate(ctx, id, hetzner.ServerUpdateRequest{Labels: labels}); err != nil {
		return nil, err
	}
	return Server(ctx, id)
}

// ServerDelete deletes a server and returns the delete action.
func ServerDelete(ctx context.Context, id int64) (types.ActionInfo, error) {
	action, err := hcloud.ServerDelete(ctx, id)
	if err != nil {
		return types.ActionInfo{}, err
	}
	return actionInfo(*action), nil
}

// ActionResult is what every action endpoint returns. Most actions leave
// RootPassword empty; firewall rule/apply actions return several rows and
// then Action mirrors the first of them.
type ActionResult struct {
	Action       types.ActionInfo   `json:"action"`
	Actions      []types.ActionInfo `json:"actions"`
	RootPassword string             `json:"rootPassword"`
}

// ServerAction runs one whitelisted server action with an optional payload.
func ServerAction(ctx context.Context, id int64, name string, payload map[string]any) (*ActionResult, error) {
	if !allowedActions[name] {
		return nil, ErrActionNotAllowed
	}

	res, err := hcloud.DoServerAction(ctx, id, name, payload)
	if err != nil {
		return nil, err
	}

	out := &ActionResult{Action: actionInfo(res.Action)}
	if res.RootPassword != nil {
		out.RootPassword = *res.RootPassword
	}
	return out, nil
}

// Action returns the current state of one Hetzner action (toast polling).
func Action(ctx context.Context, id int64) (types.ActionInfo, error) {
	a, err := hcloud.Action(ctx, id)
	if err != nil {
		return types.ActionInfo{}, err
	}
	return actionInfo(*a), nil
}

// Snapshots counts the snapshots bound to one server (delete confirmation).
func Snapshots(ctx context.Context, id int64) (types.SnapshotsInfo, error) {
	images, err := hcloud.Images(ctx, "snapshot")
	if err != nil {
		return types.SnapshotsInfo{}, err
	}
	var info types.SnapshotsInfo
	for _, img := range images {
		if img.BoundTo == nil || *img.BoundTo != id {
			continue
		}
		info.Count++
		if img.ImageSize != nil {
			info.SizeGB += int(*img.ImageSize)
		}
	}
	return info, nil
}

// ServerCreate provisions a server. The root password (present when no SSH
// key applies) is returned once and never stored — the frontend shows it and
// forgets it.
func ServerCreate(ctx context.Context, req types.CreateRequest) (*types.CreateResult, error) {
	if req.Name == "" || req.ServerType == "" || req.Image == "" || req.Location == "" {
		return nil, fmt.Errorf("name, type, image and location are required")
	}

	body := hetzner.ServerCreateRequest{
		Name:             req.Name,
		ServerType:       req.ServerType,
		Image:            req.Image,
		Location:         req.Location,
		SSHKeys:          req.SSHKeys,
		UserData:         req.UserData,
		StartAfterCreate: &req.StartAfterCreate,
		Backups:          &req.Backups,
		PublicNet: &hetzner.ServerCreatePublicNet{
			EnableIPv4: req.EnableIPv4,
			EnableIPv6: req.EnableIPv6,
		},
	}

	res, err := hcloud.ServerCreate(ctx, body)
	if err != nil {
		return nil, err
	}

	idx, _ := prices(ctx)
	out := &types.CreateResult{
		Server: toFleetItem(res.Server, idx, hetzner.Action{}, nil),
		Action: actionInfo(res.Action),
	}
	if res.RootPassword != nil {
		out.RootPassword = *res.RootPassword
	}
	for _, next := range res.NextActions {
		out.NextActions = append(out.NextActions, actionInfo(next))
	}

	fleetCache.del("fleet") // the next list fetch must show the new server
	return out, nil
}
