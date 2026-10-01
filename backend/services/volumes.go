package services

import (
	"context"
	"fmt"
	"time"

	"hector/backend/hetzner"
	"hector/backend/types"
)

// Collections are cached for a short window: the panel polls its own lists,
// and every read that misses the cache costs one Hetzner request out of the
// hourly quota.
const collectionTTL = 30 * time.Second

var (
	volumesCache       = newTTLCache[[]types.Volume]()
	networksCache      = newTTLCache[[]types.Network]()
	firewallsCache     = newTTLCache[[]types.Firewall]()
	floatingIPsCache   = newTTLCache[[]types.FloatingIP]()
	primaryIPsCache    = newTTLCache[[]types.PrimaryIP]()
	loadBalancersCache = newTTLCache[[]types.LoadBalancer]()
	placementCache     = newTTLCache[[]types.PlacementGroup]()
	certificatesCache  = newTTLCache[[]types.Certificate]()
	sshKeysCache       = newTTLCache[[]types.SSHKey]()
)

// ---- volumes -----------------------------------------------------------

func toVolume(v hetzner.Volume) types.Volume {
	out := types.Volume{
		ID:            v.ID,
		Name:          v.Name,
		SizeGB:        v.Size,
		Status:        v.Status,
		Location:      locationInfo(v.Location),
		ServerID:      v.Server,
		Format:        deref(v.Format),
		Labels:        v.Labels,
		ProtectDelete: v.Protection.Delete,
		Created:       v.Created,
	}
	if v.LinuxDevice != "" {
		out.Device = v.LinuxDevice
	}
	return out
}

// Volumes lists every volume of the project.
func Volumes(ctx context.Context) ([]types.Volume, error) {
	if v, ok := volumesCache.get("all"); ok {
		return v, nil
	}
	raw, err := hcloud.Volumes(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]types.Volume, 0, len(raw))
	for _, vol := range raw {
		out = append(out, toVolume(vol))
	}
	volumesCache.set("all", out, collectionTTL)
	return out, nil
}

// Volume is one volume; the list cache is refreshed so the next list read
// reflects whatever the detail view just changed.
func Volume(ctx context.Context, id int64) (*types.Volume, error) {
	v, err := hcloud.Volume(ctx, id)
	if err != nil {
		return nil, err
	}
	out := toVolume(*v)
	volumesCache.del("all")
	return &out, nil
}

// VolumeCreate provisions a volume and reports the attach action.
func VolumeCreate(ctx context.Context, req types.VolumeCreateRequest) (*types.Volume, *ActionResult, error) {
	if req.Name == "" || req.SizeGB <= 0 || req.Location == "" {
		return nil, nil, fmt.Errorf("name, sizeGb and location are required")
	}
	body := hetzner.VolumeCreateRequest{
		Name:   req.Name,
		Size:   req.SizeGB,
		Format: optionalString(req.Format),
		Labels: req.Labels,
	}
	if req.Location != "" {
		body.Location = &hetzner.IDOrName{Name: locationSlug(req.Location)}
	}
	if req.ServerID != nil {
		body.Server = req.ServerID
	}
	automount := req.Automount
	body.Automount = &automount

	res, err := hcloud.VolumeCreate(ctx, body)
	if err != nil {
		return nil, nil, err
	}
	volumesCache.del("all")

	out := &ActionResult{}
	if res.Action != nil {
		out.Actions = append(out.Actions, actionInfo(*res.Action))
	}
	for _, a := range res.NextActions {
		out.Actions = append(out.Actions, actionInfo(a))
	}
	if len(out.Actions) > 0 {
		out.Action = out.Actions[0]
	}
	v := toVolume(res.Volume)
	return &v, out, nil
}

// VolumeUpdate renames a volume and/or replaces its labels.
func VolumeUpdate(ctx context.Context, id int64, name string, labels map[string]string) (*types.Volume, error) {
	body := hetzner.VolumeUpdateRequest{Name: name, Labels: labels}
	v, err := hcloud.VolumeUpdate(ctx, id, body)
	if err != nil {
		return nil, err
	}
	volumesCache.del("all")
	out := toVolume(*v)
	return &out, nil
}

// VolumeDelete removes a volume. Detach it first — Hetzner rejects a delete
// while a volume is attached, and the API error says so.
func VolumeDelete(ctx context.Context, id int64) (*ActionResult, error) {
	a, err := hcloud.VolumeDelete(ctx, id)
	if err != nil {
		return nil, err
	}
	volumesCache.del("all")
	out := &ActionResult{}
	if a != nil {
		out.Action = actionInfo(*a)
		out.Actions = []types.ActionInfo{out.Action}
	}
	return out, nil
}

// VolumeAction runs one allowlisted volume action with a typed payload.
func VolumeAction(ctx context.Context, id int64, name string, body map[string]any) (*ActionResult, error) {
	payload, err := volumePayload(name, body)
	if err != nil {
		return nil, err
	}
	res, err := managedAction(ctx, "volumes", id, name, payload)
	if err != nil {
		return nil, err
	}
	volumesCache.del("all")
	return res, nil
}

func volumePayload(name string, body map[string]any) (any, error) {
	switch name {
	case "attach":
		server, err := fieldInt64(body, "serverId", true)
		if err != nil {
			return nil, err
		}
		automount, err := fieldBool(body, "automount")
		if err != nil {
			return nil, err
		}
		return struct {
			Server    int64 `json:"server"`
			Automount bool  `json:"automount,omitempty"`
		}{Server: server, Automount: automount}, nil
	case "resize":
		size, err := fieldInt64(body, "sizeGb", true)
		if err != nil {
			return nil, err
		}
		if size <= 0 {
			return nil, fmt.Errorf("%w: sizeGb must be positive", ErrBadField)
		}
		return struct {
			Size int64 `json:"size"`
		}{Size: size}, nil
	case "change_protection":
		protect, err := fieldBool(body, "protect")
		if err != nil {
			return nil, err
		}
		return struct {
			Delete bool `json:"delete"`
		}{Delete: protect}, nil
	case "detach":
		return struct{}{}, nil
	default:
		return nil, ErrActionNotAllowed
	}
}

// ---- small helpers shared by the resource views ------------------------

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func optionalString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
