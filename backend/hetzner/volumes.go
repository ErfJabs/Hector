package hetzner

import (
	"context"
	"time"
)

// ---- volumes -----------------------------------------------------------

type VolumeProtection struct {
	Delete bool `json:"delete"`
}

type Volume struct {
	ID          int64             `json:"id"`
	Name        string            `json:"name"`
	Server      *int64            `json:"server"`
	Status      string            `json:"status"`
	Location    Location          `json:"location"`
	Size        int               `json:"size"`
	Format      *string           `json:"format"`
	Protection  VolumeProtection  `json:"protection"`
	Labels      map[string]string `json:"labels"`
	LinuxDevice string            `json:"linux_device"`
	Created     time.Time         `json:"created"`
}

type VolumeCreateRequest struct {
	Name      string            `json:"name"`
	Size      int               `json:"size"`
	Server    *int64            `json:"server,omitempty"`
	Location  *IDOrName         `json:"location,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
	Automount *bool             `json:"automount,omitempty"`
	Format    *string           `json:"format,omitempty"`
}

type VolumeCreateResponse struct {
	Volume      Volume   `json:"volume"`
	Action      *Action  `json:"action"`
	NextActions []Action `json:"next_actions"`
}

// VolumeUpdateRequest is the PUT /volumes/{id} body.
type VolumeUpdateRequest struct {
	Name   string            `json:"name,omitempty"`
	Labels map[string]string `json:"labels,omitempty"`
}

// IDOrName is a create-time location reference: either the numeric id or the
// slug ("fsn1"). The API accepts both.
type IDOrName struct {
	ID   int64  `json:"id,omitempty"`
	Name string `json:"name,omitempty"`
}

func (c *Client) Volumes(ctx context.Context) ([]Volume, error) {
	return listAll[Volume](ctx, c, "/volumes", "volumes", nil)
}

func (c *Client) Volume(ctx context.Context, id int64) (*Volume, error) {
	return getResource[Volume](ctx, c, "volumes", id, "volume")
}

func (c *Client) VolumeCreate(ctx context.Context, req VolumeCreateRequest) (*VolumeCreateResponse, error) {
	var res VolumeCreateResponse
	if err := createResource(ctx, c, "volumes", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (c *Client) VolumeUpdate(ctx context.Context, id int64, body VolumeUpdateRequest) (*Volume, error) {
	return updateResource[Volume](ctx, c, "volumes", id, body, "volume")
}

func (c *Client) VolumeDelete(ctx context.Context, id int64) (*Action, error) {
	return deleteResource(ctx, c, "volumes", id)
}

// DoVolumeAction posts to /volumes/{id}/actions/{name}; name is allowlisted
// by the services layer.
func (c *Client) DoVolumeAction(ctx context.Context, id int64, name string, payload any) (*ActionResponse, error) {
	return doResourceAction(ctx, c, "volumes", id, name, payload)
}

// VolumeActions lists recent actions for one volume, newest first.
func (c *Client) VolumeActions(ctx context.Context, id int64, perPage int) ([]Action, int, error) {
	return resourceActions(ctx, c, "volumes", id, perPage)
}
