package hetzner

import (
	"context"
	"net/url"
	"time"
)

// ---- certificates ------------------------------------------------------

type CertificateStatusRef struct {
	Issuance string       `json:"issuance"`
	Renewal  string       `json:"renewal"`
	Error    *ActionError `json:"error,omitempty"`
}

type CertificateUsedBy struct {
	ID   int64  `json:"id"`
	Type string `json:"type"`
}

type Certificate struct {
	ID             int64                 `json:"id"`
	Name           string                `json:"name"`
	Labels         map[string]string     `json:"labels"`
	Type           string                `json:"type"`
	Certificate    string                `json:"certificate"`
	Created        time.Time             `json:"created"`
	NotValidBefore time.Time             `json:"not_valid_before"`
	NotValidAfter  time.Time             `json:"not_valid_after"`
	DomainNames    []string              `json:"domain_names"`
	Fingerprint    string                `json:"fingerprint"`
	Status         *CertificateStatusRef `json:"status"`
	UsedBy         []CertificateUsedBy   `json:"used_by"`
}

type CertificateCreateRequest struct {
	Name        string            `json:"name"`
	Type        string            `json:"type"`
	DomainNames []string          `json:"domain_names,omitempty"`
	Certificate string            `json:"certificate,omitempty"`
	PrivateKey  string            `json:"private_key,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
}

type CertificateCreateResponse struct {
	Certificate Certificate `json:"certificate"`
	Action      *Action     `json:"action"`
}

// CertificateUpdateRequest is the PUT /certificates/{id} body.
type CertificateUpdateRequest struct {
	Name   string            `json:"name,omitempty"`
	Labels map[string]string `json:"labels,omitempty"`
}

func (c *Client) Certificates(ctx context.Context) ([]Certificate, error) {
	return listAll[Certificate](ctx, c, "/certificates", "certificates", nil)
}

func (c *Client) Certificate(ctx context.Context, id int64) (*Certificate, error) {
	return getResource[Certificate](ctx, c, "certificates", id, "certificate")
}

func (c *Client) CertificateCreate(ctx context.Context, req CertificateCreateRequest) (*CertificateCreateResponse, error) {
	var res CertificateCreateResponse
	if err := createResource(ctx, c, "certificates", req, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (c *Client) CertificateUpdate(ctx context.Context, id int64, body CertificateUpdateRequest) (*Certificate, error) {
	return updateResource[Certificate](ctx, c, "certificates", id, body, "certificate")
}

func (c *Client) CertificateDelete(ctx context.Context, id int64) (*Action, error) {
	return deleteResource(ctx, c, "certificates", id)
}

// CertificateRetryIssuance re-runs issuance for a failed managed certificate
// (POST /certificates/{id}/actions/retry_issuance).
func (c *Client) CertificateRetryIssuance(ctx context.Context, id int64) (*Action, error) {
	res, err := doResourceAction(ctx, c, "certificates", id, "retry_issuance", nil)
	if err != nil {
		return nil, err
	}
	a := res.First()
	return &a, nil
}

// ---- SSH keys ----------------------------------------------------------

type SSHKeyCreateRequest struct {
	Name      string            `json:"name"`
	PublicKey string            `json:"public_key"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// SSHKeyUpdateRequest is the PUT /ssh_keys/{id} body.
type SSHKeyUpdateRequest struct {
	Name   string            `json:"name,omitempty"`
	Labels map[string]string `json:"labels,omitempty"`
}

func (c *Client) SSHKeyCreate(ctx context.Context, req SSHKeyCreateRequest) (*SSHKey, error) {
	var res struct {
		SSHKey SSHKey `json:"ssh_key"`
	}
	if err := createResource(ctx, c, "ssh_keys", req, &res); err != nil {
		return nil, err
	}
	return &res.SSHKey, nil
}

func (c *Client) SSHKey(ctx context.Context, id int64) (*SSHKey, error) {
	return getResource[SSHKey](ctx, c, "ssh_keys", id, "ssh_key")
}

func (c *Client) SSHKeyUpdate(ctx context.Context, id int64, body SSHKeyUpdateRequest) (*SSHKey, error) {
	return updateResource[SSHKey](ctx, c, "ssh_keys", id, body, "ssh_key")
}

// SSHKeyDelete removes an SSH key. DELETE /ssh_keys/{id} answers with an
// empty body, so there is never an action to report.
func (c *Client) SSHKeyDelete(ctx context.Context, id int64) error {
	_, err := deleteResource(ctx, c, "ssh_keys", id)
	return err
}

// ---- images ------------------------------------------------------------

// ImageFilter narrows GET /images. Every field maps 1:1 to an API query
// parameter; zero values are omitted.
type ImageFilter struct {
	Type           string // system | snapshot | backup | relocation
	Status         string // creating | available | deprecated
	Name           string
	Architecture   string
	IncludeDeleted bool
}

func (f ImageFilter) values() url.Values {
	q := url.Values{}
	if f.Type != "" {
		q.Set("type", f.Type)
	}
	if f.Status != "" {
		q.Set("status", f.Status)
	}
	if f.Name != "" {
		q.Set("name", f.Name)
	}
	if f.Architecture != "" {
		q.Set("architecture", f.Architecture)
	}
	if f.IncludeDeleted {
		q.Set("include_deprecated", "true")
	}
	return q
}

// ImageList fetches images with API-side filtering (one request per page)
// instead of downloading the whole catalogue.
func (c *Client) ImageList(ctx context.Context, f ImageFilter) ([]Image, error) {
	return listAll[Image](ctx, c, "/images", "images", f.values())
}

// ImageUpdateRequest is the PUT /images/{id} body.
type ImageUpdateRequest struct {
	Description *string           `json:"description,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
}

// ImageDelete deletes an image. DELETE /images/{id} answers with an empty
// body (there is no action to poll).
func (c *Client) ImageDelete(ctx context.Context, id int64) error {
	_, err := deleteResource(ctx, c, "images", id)
	return err
}

// DoImageAction posts to /images/{id}/actions/{name} (change_protection).
func (c *Client) DoImageAction(ctx context.Context, id int64, name string, payload any) (*ActionResponse, error) {
	return doResourceAction(ctx, c, "images", id, name, payload)
}

// ImageActions lists recent actions for one image, newest first.
func (c *Client) ImageActions(ctx context.Context, id int64, perPage int) ([]Action, int, error) {
	return resourceActions(ctx, c, "images", id, perPage)
}
