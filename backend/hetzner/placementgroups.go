package hetzner

import (
	"context"
	"time"
)

// ---- placement groups --------------------------------------------------

type PlacementGroup struct {
	ID      int64             `json:"id"`
	Name    string            `json:"name"`
	Labels  map[string]string `json:"labels"`
	Created time.Time         `json:"created"`
	Servers []int64           `json:"servers"`
	Type    string            `json:"type"`
}

type PlacementGroupCreateRequest struct {
	Name   string            `json:"name"`
	Labels map[string]string `json:"labels,omitempty"`
	Type   string            `json:"type"`
}

type PlacementGroupCreateResponse struct {
	PlacementGroup PlacementGroup `json:"placement_group"`
	Action         *Action        `json:"action"`
}

// PlacementGroupUpdateRequest is the PUT /placement_groups/{id} body.
type PlacementGroupUpdateRequest struct {
	Name   string            `json:"name,omitempty"`
	Labels map[string]string `json:"labels,omitempty"`
}

func (c *Client) PlacementGroups(ctx context.Context) ([]PlacementGroup, error) {
	return listAll[PlacementGroup](ctx, c, "/placement_groups", "placement_groups", nil)
}

func (c *Client) PlacementGroup(ctx context.Context, id int64) (*PlacementGroup, error) {
	return getResource[PlacementGroup](ctx, c, "placement_groups", id, "placement_group")
}

func (c *Client) PlacementGroupCreate(ctx context.Context, req PlacementGroupCreateRequest) (*PlacementGroupCreateResponse, error) {
	var res PlacementGroupCreateResponse
	if err := createResource(ctx, c, "placement_groups", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (c *Client) PlacementGroupUpdate(ctx context.Context, id int64, body PlacementGroupUpdateRequest) (*PlacementGroup, error) {
	return updateResource[PlacementGroup](ctx, c, "placement_groups", id, body, "placement_group")
}

func (c *Client) PlacementGroupDelete(ctx context.Context, id int64) (*Action, error) {
	return deleteResource(ctx, c, "placement_groups", id)
}
