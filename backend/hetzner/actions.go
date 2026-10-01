package hetzner

import (
	"context"
	"net/url"
	"strconv"
)

// ProjectActions lists actions across the whole project, newest first.
// status may be "", "running", "success" or "error"; perPage<=0 defaults to
// 50 (the API maximum). The second return value is how many actions match
// the filter, which the activity view shows as a count.
//
// Only one page is fetched on purpose: the panel renders a recent-history
// feed, and walking the full action log would burn the hourly quota on rows
// nobody scrolls to.
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

	page, err := listPage[Action](ctx, c, "/actions", "actions", q)
	if err != nil {
		return nil, 0, err
	}
	return page.Items, page.Total, nil
}
