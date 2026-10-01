package hetzner

import (
	"context"
	"net/http"
	"net/url"
)

// ---- catalog -----------------------------------------------------------

func (c *Client) ServerTypes(ctx context.Context) ([]ServerType, error) {
	return listAll[ServerType](ctx, c, "/server_types", "server_types", nil)
}

func (c *Client) Locations(ctx context.Context) ([]Location, error) {
	return listAll[Location](ctx, c, "/locations", "locations", nil)
}

func (c *Client) Datacenters(ctx context.Context) ([]Datacenter, error) {
	return listAll[Datacenter](ctx, c, "/datacenters", "datacenters", nil)
}

func (c *Client) Images(ctx context.Context, imageType string) ([]Image, error) {
	q := url.Values{}
	if imageType != "" {
		q.Set("type", imageType)
	}
	return listAll[Image](ctx, c, "/images", "images", q)
}

func (c *Client) SSHKeys(ctx context.Context) ([]SSHKey, error) {
	return listAll[SSHKey](ctx, c, "/ssh_keys", "ssh_keys", nil)
}

func (c *Client) ISOs(ctx context.Context) ([]ISO, error) {
	return listAll[ISO](ctx, c, "/isos", "isos", nil)
}

func (c *Client) Pricing(ctx context.Context) (*Pricing, error) {
	var res struct {
		Pricing Pricing `json:"pricing"`
	}
	if err := c.do(ctx, http.MethodGet, "/pricing", nil, &res); err != nil {
		return nil, err
	}
	return &res.Pricing, nil
}
