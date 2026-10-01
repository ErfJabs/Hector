package hetzner

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
)

// Every Hetzner collection follows the same shape: /{collection}, /{collection}/{id},
// /{collection}/{id}/actions/{name}, and responses wrapped in {key: {...}}.
// The verbs below are the single implementation of that shape; the per-resource
// files only declare their path, envelope key and wire types.
//
// Go does not allow type parameters on methods, so the typed verbs are free
// functions taking the client. Call sites read as getResource[Volume](...).

// getResource GETs /{collection}/{id} and unwraps {key: ...}.
func getResource[T any](ctx context.Context, c *Client, collection string, id int64, key string) (*T, error) {
	var raw map[string]json.RawMessage
	if err := c.do(ctx, http.MethodGet, fmt.Sprintf("/%s/%d", collection, id), nil, &raw); err != nil {
		return nil, err
	}
	body, ok := raw[key]
	if !ok {
		return nil, fmt.Errorf("decode %s %d: response has no %q", collection, id, key)
	}
	var v T
	if err := json.Unmarshal(body, &v); err != nil {
		return nil, fmt.Errorf("decode %s %d: %w", collection, id, err)
	}
	return &v, nil
}

// updateResource PUTs body to /{collection}/{id} and unwraps {key: ...}.
// body is always a typed struct from the calling resource file — a raw map
// from the client is never forwarded, so mass assignment cannot reach Hetzner.
func updateResource[T any](ctx context.Context, c *Client, collection string, id int64, body any, key string) (*T, error) {
	var raw map[string]json.RawMessage
	if err := c.do(ctx, http.MethodPut, fmt.Sprintf("/%s/%d", collection, id), body, &raw); err != nil {
		return nil, err
	}
	b, ok := raw[key]
	if !ok {
		return nil, fmt.Errorf("decode %s %d: response has no %q", collection, id, key)
	}
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		return nil, fmt.Errorf("decode %s %d: %w", collection, id, err)
	}
	return &v, nil
}

// createResource POSTs body to /{collection} and decodes the collection's own
// envelope ({volume, action}, {firewall}, ...) into out. out may be nil when
// the caller does not need the response.
func createResource(ctx context.Context, c *Client, collection string, body any, out any) error {
	return c.do(ctx, http.MethodPost, "/"+collection, body, out)
}

// deleteResource DELETEs /{collection}/{id}. Most collections answer with an
// empty body; /servers/{id} answers with {action}. The action is returned when
// there is one and nil otherwise, so callers never invent a fake progress row.
func deleteResource(ctx context.Context, c *Client, collection string, id int64) (*Action, error) {
	var raw map[string]json.RawMessage
	if err := c.do(ctx, http.MethodDelete, fmt.Sprintf("/%s/%d", collection, id), nil, &raw); err != nil {
		return nil, err
	}
	b, ok := raw["action"]
	if !ok || len(b) == 0 {
		return nil, nil
	}
	var a Action
	if err := json.Unmarshal(b, &a); err != nil {
		return nil, fmt.Errorf("decode delete action: %w", err)
	}
	return &a, nil
}

// ActionResponse is what POST /{collection}/{id}/actions/{name} can return.
// Most endpoints fill Action; rebuild/enable_rescue/reset_password can add
// RootPassword, request_console adds WSSURL+Password, and the firewall
// rule/resource endpoints return a list in Actions instead of one action.
type ActionResponse struct {
	Action       Action   `json:"action"`
	Actions      []Action `json:"actions"`
	RootPassword *string  `json:"root_password"`
	WSSURL       string   `json:"wss_url"`
	Password     string   `json:"password"`
}

// All returns every action the response carried, in a stable shape.
func (r *ActionResponse) All() []Action {
	if r.Action.ID != 0 {
		return []Action{r.Action}
	}
	return r.Actions
}

// First returns the primary action, or the first of a list. Zero when the
// endpoint returned none (e.g. a delete).
func (r *ActionResponse) First() Action {
	if r.Action.ID != 0 {
		return r.Action
	}
	if len(r.Actions) > 0 {
		return r.Actions[0]
	}
	return Action{}
}

// doResourceAction POSTs /{collection}/{id}/actions/{name} with an optional
// payload. The caller is responsible for allowlisting name.
func doResourceAction(ctx context.Context, c *Client, collection string, id int64, name string, payload any) (*ActionResponse, error) {
	var res ActionResponse
	path := fmt.Sprintf("/%s/%d/actions/%s", collection, id, name)
	if err := c.do(ctx, http.MethodPost, path, payload, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// resourceActions lists recent actions for one resource, newest first, and
// reports how many actions the resource has in total. Hetzner's sort syntax
// is "field:direction" — there is no separate sort_order parameter, and
// omitting it returns the oldest rows first.
func resourceActions(ctx context.Context, c *Client, collection string, id int64, perPage int) ([]Action, int, error) {
	q := url.Values{}
	if perPage > 0 {
		q.Set("per_page", strconv.Itoa(perPage))
	}
	q.Set("sort", "id:desc")

	page, err := listPage[Action](ctx, c, fmt.Sprintf("/%s/%d/actions", collection, id), "actions", q)
	if err != nil {
		return nil, 0, err
	}
	return page.Items, page.Total, nil
}
