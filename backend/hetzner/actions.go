package hetzner

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
)

// ProjectActions lists actions across the whole project, newest first.
// status may be "", "running", "success" or "error". perPage<=0 defaults to
// 50 (the API maximum). The second return value is the total number of
// actions matching the filter, which the UI shows as a count.
func (c *Client) ProjectActions(ctx context.Context, status string, perPage int) ([]Action, int, error) {
	q := url.Values{}
	if status != "" {
		q.Set("status", status)
	}
	if perPage <= 0 {
		perPage = 50
	}
	q.Set("per_page", strconv.Itoa(perPage))
	q.Set("sort", "id:desc")

	var raw map[string]json.RawMessage
	if err := c.do(ctx, http.MethodGet, "/actions?"+q.Encode(), nil, &raw); err != nil {
		return nil, 0, err
	}
	var meta struct {
		Pagination struct {
			TotalEntries int `json:"total_entries"`
		} `json:"pagination"`
	}
	if err := json.Unmarshal(raw["meta"], &meta); err != nil {
		return nil, 0, fmt.Errorf("decode action meta: %w", err)
	}
	var actions []Action
	if err := json.Unmarshal(raw["actions"], &actions); err != nil {
		return nil, 0, fmt.Errorf("decode actions: %w", err)
	}
	if actions == nil {
		actions = []Action{}
	}
	return actions, meta.Pagination.TotalEntries, nil
}
