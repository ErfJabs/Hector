package hetzner

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// ---- servers -----------------------------------------------------------

func (c *Client) Servers(ctx context.Context) ([]Server, error) {
	return listAll[Server](ctx, c, "/servers", "servers", nil)
}

func (c *Client) Server(ctx context.Context, id int64) (*Server, error) {
	return getResource[Server](ctx, c, "servers", id, "server")
}

func (c *Client) ServerCreate(ctx context.Context, req ServerCreateRequest) (*ServerCreateResponse, error) {
	var res ServerCreateResponse
	if err := createResource(ctx, c, "servers", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ServerUpdate renames a server and/or replaces its labels. name/labels are
// built by the caller, never taken from the client verbatim.
func (c *Client) ServerUpdate(ctx context.Context, id int64, body ServerUpdateRequest) (*Server, error) {
	return updateResource[Server](ctx, c, "servers", id, body, "server")
}

func (c *Client) ServerDelete(ctx context.Context, id int64) (*Action, error) {
	return deleteResource(ctx, c, "servers", id)
}

// DoServerAction posts to /servers/{id}/actions/{name}. payload may be nil.
// request_console additionally fills WSSURL and Password on the response.
func (c *Client) DoServerAction(ctx context.Context, id int64, name string, payload any) (*ActionResponse, error) {
	return doResourceAction(ctx, c, "servers", id, name, payload)
}

// ServerActions lists recent actions for one server, newest first, and
// reports how many actions the server has in total.
func (c *Client) ServerActions(ctx context.Context, id int64, perPage int) ([]Action, int, error) {
	return resourceActions(ctx, c, "servers", id, perPage)
}

// RunningActions lists actions currently running for the whole project.
func (c *Client) RunningActions(ctx context.Context) ([]Action, error) {
	q := url.Values{}
	q.Set("status", "running")
	q.Set("per_page", "50")
	return listAll[Action](ctx, c, "/actions", "actions", q)
}

func (c *Client) Action(ctx context.Context, id int64) (*Action, error) {
	var res struct {
		Action Action `json:"action"`
	}
	if err := c.do(ctx, http.MethodGet, fmt.Sprintf("/actions/%d", id), nil, &res); err != nil {
		return nil, err
	}
	return &res.Action, nil
}

// ---- metrics -----------------------------------------------------------

// ServerMetrics fetches metrics for one server. types is a list of
// "cpu", "disk", "network" (repeatable query parameter).
func (c *Client) ServerMetrics(ctx context.Context, id int64, types []string, start, end time.Time, step int) (*Metrics, error) {
	q := url.Values{}
	for _, t := range types {
		q.Add("type", t)
	}
	q.Set("start", start.UTC().Format(time.RFC3339))
	q.Set("end", end.UTC().Format(time.RFC3339))
	if step > 0 {
		q.Set("step", strconv.Itoa(step))
	}
	var res struct {
		Metrics Metrics `json:"metrics"`
	}
	if err := c.do(ctx, http.MethodGet, fmt.Sprintf("/servers/%d/metrics?%s", id, q.Encode()), nil, &res); err != nil {
		return nil, err
	}
	return &res.Metrics, nil
}
