package services

import (
	"context"

	"hector/backend/types"
)

// Activity is the project-wide action feed: everything Hetzner reports as
// running right now plus the 50 most recent finished actions, so the panel
// can show a single history without polling every resource separately.
func Activity(ctx context.Context) (*types.Activity, error) {
	recent, total, err := hcloud.ProjectActions(ctx, "", 50)
	if err != nil {
		return nil, err
	}

	out := &types.Activity{Actions: []types.ActionInfo{}, Running: []types.ActionInfo{}, Total: total}
	for _, a := range recent {
		info := actionInfo(a)
		out.Actions = append(out.Actions, info)
		if a.Status == "running" {
			out.Running = append(out.Running, info)
		}
	}
	return out, nil
}
