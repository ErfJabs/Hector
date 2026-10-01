package services

import (
	"context"
	"fmt"
	"strings"

	"hector/backend/hetzner"
	"hector/backend/types"
)

// ---- placement groups --------------------------------------------------

func toPlacementGroup(p hetzner.PlacementGroup) types.PlacementGroup {
	servers := p.Servers
	if servers == nil {
		servers = []int64{}
	}
	return types.PlacementGroup{
		ID:        p.ID,
		Name:      p.Name,
		Type:      p.Type,
		ServerIDs: servers,
		Labels:    p.Labels,
		Created:   p.Created,
	}
}

// PlacementGroups lists the placement groups of the project.
func PlacementGroups(ctx context.Context) ([]types.PlacementGroup, error) {
	if v, ok := placementCache.get("all"); ok {
		return v, nil
	}
	raw, err := hcloud.PlacementGroups(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]types.PlacementGroup, 0, len(raw))
	for _, p := range raw {
		out = append(out, toPlacementGroup(p))
	}
	placementCache.set("all", out, collectionTTL)
	return out, nil
}

// PlacementGroupCreate creates a spread or fanout placement group.
func PlacementGroupCreate(ctx context.Context, req types.PlacementGroupCreateRequest) (*types.PlacementGroup, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	typ := req.Type
	if typ == "" {
		typ = "spread"
	}
	if typ != "spread" && typ != "fanout" {
		return nil, fmt.Errorf("%w: type must be spread or fanout", ErrBadField)
	}
	res, err := hcloud.PlacementGroupCreate(ctx, hetzner.PlacementGroupCreateRequest{
		Name:   req.Name,
		Type:   typ,
		Labels: req.Labels,
	})
	if err != nil {
		return nil, err
	}
	placementCache.del("all")
	out := toPlacementGroup(res.PlacementGroup)
	return &out, nil
}

// PlacementGroupUpdate renames a placement group and/or replaces its labels.
func PlacementGroupUpdate(ctx context.Context, id int64, name string, labels map[string]string) (*types.PlacementGroup, error) {
	p, err := hcloud.PlacementGroupUpdate(ctx, id, hetzner.PlacementGroupUpdateRequest{Name: name, Labels: labels})
	if err != nil {
		return nil, err
	}
	placementCache.del("all")
	out := toPlacementGroup(*p)
	return &out, nil
}

// PlacementGroupDelete removes a placement group. Servers inside it must be
// removed first — the API answers 422 and that message reaches the UI.
func PlacementGroupDelete(ctx context.Context, id int64) error {
	if _, err := hcloud.PlacementGroupDelete(ctx, id); err != nil {
		return err
	}
	placementCache.del("all")
	return nil
}

// ---- certificates ------------------------------------------------------

func toCertificate(c hetzner.Certificate) types.Certificate {
	out := types.Certificate{
		ID:             c.ID,
		Name:           c.Name,
		Type:           c.Type,
		DomainNames:    c.DomainNames,
		Fingerprint:    c.Fingerprint,
		NotValidBefore: c.NotValidBefore,
		NotValidAfter:  c.NotValidAfter,
		Labels:         c.Labels,
		Created:        c.Created,
		UsedBy:         []types.CertificateUsedBy{},
	}
	if out.DomainNames == nil {
		out.DomainNames = []string{}
	}
	if c.Status != nil {
		out.Issuance = c.Status.Issuance
		out.Renewal = c.Status.Renewal
		if c.Status.Error != nil {
			out.IssuanceError = c.Status.Error.Message
		}
	}
	for _, u := range c.UsedBy {
		out.UsedBy = append(out.UsedBy, types.CertificateUsedBy{ID: u.ID, Type: u.Type})
	}
	return out
}

// Certificates lists every TLS certificate of the project.
func Certificates(ctx context.Context) ([]types.Certificate, error) {
	if v, ok := certificatesCache.get("all"); ok {
		return v, nil
	}
	raw, err := hcloud.Certificates(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]types.Certificate, 0, len(raw))
	for _, c := range raw {
		out = append(out, toCertificate(c))
	}
	certificatesCache.set("all", out, collectionTTL)
	return out, nil
}

// CertificateCreate registers a managed (Hetzner-issued) or an uploaded
// certificate. The two shapes are mutually exclusive, so mixing them is
// rejected here rather than sent to the API.
func CertificateCreate(ctx context.Context, req types.CertificateCreateRequest) (*types.Certificate, *ActionResult, error) {
	if req.Name == "" {
		return nil, nil, fmt.Errorf("name is required")
	}
	body := hetzner.CertificateCreateRequest{
		Name:   req.Name,
		Labels: req.Labels,
	}
	switch req.Type {
	case "", "managed":
		if len(req.DomainNames) == 0 {
			return nil, nil, fmt.Errorf("domainNames is required for a managed certificate")
		}
		body.Type = "managed"
		body.DomainNames = req.DomainNames
	case "uploaded":
		if req.Certificate == "" || req.PrivateKey == "" {
			return nil, nil, fmt.Errorf("certificate and privateKey are required for an uploaded certificate")
		}
		body.Type = "uploaded"
		body.Certificate = req.Certificate
		body.PrivateKey = req.PrivateKey
	default:
		return nil, nil, fmt.Errorf("%w: type must be managed or uploaded", ErrBadField)
	}

	res, err := hcloud.CertificateCreate(ctx, body)
	if err != nil {
		return nil, nil, err
	}
	certificatesCache.del("all")

	out := &ActionResult{}
	if res.Action != nil {
		out.Actions = []types.ActionInfo{actionInfo(*res.Action)}
		out.Action = out.Actions[0]
	}
	c := toCertificate(res.Certificate)
	return &c, out, nil
}

// CertificateUpdate renames a certificate and/or replaces its labels.
func CertificateUpdate(ctx context.Context, id int64, name string, labels map[string]string) (*types.Certificate, error) {
	c, err := hcloud.CertificateUpdate(ctx, id, hetzner.CertificateUpdateRequest{Name: name, Labels: labels})
	if err != nil {
		return nil, err
	}
	certificatesCache.del("all")
	out := toCertificate(*c)
	return &out, nil
}

// CertificateDelete removes a certificate that no load balancer service uses.
func CertificateDelete(ctx context.Context, id int64) error {
	if _, err := hcloud.CertificateDelete(ctx, id); err != nil {
		return err
	}
	certificatesCache.del("all")
	return nil
}

// CertificateRetry re-runs issuance for a failed managed certificate.
func CertificateRetry(ctx context.Context, id int64) (*ActionResult, error) {
	a, err := hcloud.CertificateRetryIssuance(ctx, id)
	if err != nil {
		return nil, err
	}
	certificatesCache.del("all")
	out := &ActionResult{Action: actionInfo(*a), Actions: []types.ActionInfo{actionInfo(*a)}}
	return out, nil
}

// ---- SSH keys ----------------------------------------------------------

func toSSHKey(k hetzner.SSHKey) types.SSHKey {
	return types.SSHKey{
		ID:          k.ID,
		Name:        k.Name,
		Fingerprint: k.Fingerprint,
		PublicKey:   k.PublicKey,
		Labels:      k.Labels,
		Created:     k.Created,
	}
}

// SSHKeys lists every SSH key of the project.
func SSHKeys(ctx context.Context) ([]types.SSHKey, error) {
	if v, ok := sshKeysCache.get("all"); ok {
		return v, nil
	}
	raw, err := hcloud.SSHKeys(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]types.SSHKey, 0, len(raw))
	for _, k := range raw {
		out = append(out, toSSHKey(k))
	}
	sshKeysCache.set("all", out, collectionTTL)
	return out, nil
}

// SSHKeyCreate stores a public key.
func SSHKeyCreate(ctx context.Context, req types.SSHKeyCreateRequest) (*types.SSHKey, error) {
	if req.Name == "" || req.PublicKey == "" {
		return nil, fmt.Errorf("name and publicKey are required")
	}
	if !looksLikePublicKey(req.PublicKey) {
		return nil, fmt.Errorf("%w: publicKey must be an OpenSSH public key (ssh-ed25519 ..., ssh-rsa ...)", ErrBadField)
	}
	k, err := hcloud.SSHKeyCreate(ctx, hetzner.SSHKeyCreateRequest{
		Name:      req.Name,
		PublicKey: strings.TrimSpace(req.PublicKey),
		Labels:    req.Labels,
	})
	if err != nil {
		return nil, err
	}
	sshKeysCache.del("all")
	out := toSSHKey(*k)
	return &out, nil
}

// SSHKeyUpdate renames an SSH key and/or replaces its labels.
func SSHKeyUpdate(ctx context.Context, id int64, name string, labels map[string]string) (*types.SSHKey, error) {
	k, err := hcloud.SSHKeyUpdate(ctx, id, hetzner.SSHKeyUpdateRequest{Name: name, Labels: labels})
	if err != nil {
		return nil, err
	}
	sshKeysCache.del("all")
	out := toSSHKey(*k)
	return &out, nil
}

// SSHKeyDelete removes an SSH key. Servers that were created with it keep
// their authorized_keys entry — deleting here only affects new servers.
func SSHKeyDelete(ctx context.Context, id int64) error {
	if err := hcloud.SSHKeyDelete(ctx, id); err != nil {
		return err
	}
	sshKeysCache.del("all")
	return nil
}

// looksLikePublicKey is a cheap shape check that catches pasting a private
// key or a random line before spending a Hetzner request on it.
func looksLikePublicKey(s string) bool {
	fields := strings.Fields(strings.TrimSpace(s))
	if len(fields) < 2 {
		return false
	}
	switch fields[0] {
	case "ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384",
		"ecdsa-sha2-nistp521", "sk-ssh-ed25519@openssh.com", "sk-ecdsa-sha2-nistp256@openssh.com":
		return true
	default:
		return false
	}
}

// ---- images ------------------------------------------------------------

// Images lists system images, snapshots and backups with API-side filters.
func Images(ctx context.Context, f hetzner.ImageFilter) ([]types.Image, error) {
	// Filtered reads are never cached: two callers can legitimately ask for
	// different slices and one shared entry would serve the wrong one.
	raw, err := hcloud.ImageList(ctx, f)
	if err != nil {
		return nil, err
	}
	out := make([]types.Image, 0, len(raw))
	for _, img := range raw {
		out = append(out, toImage(img))
	}
	return out, nil
}

func toImage(img hetzner.Image) types.Image {
	out := types.Image{
		ID:            img.ID,
		Name:          img.Name,
		Description:   img.Description,
		Type:          img.Type,
		Status:        img.Status,
		OSFlavor:      img.OSFlavor,
		OSVersion:     img.OSVersion,
		Arch:          img.Architecture,
		DiskGB:        int(img.DiskSize),
		BoundTo:       img.BoundTo,
		RapidDeploy:   img.RapidDeploy,
		Labels:        img.Labels,
		ProtectDelete: img.Protection.Delete,
		Deprecated:    img.Deprecated,
		Created:       img.Created,
	}
	if img.ImageSize != nil {
		out.SizeGB = int(*img.ImageSize + 0.5)
	}
	return out
}

// ImageUpdate rewrites an image's description and labels. The API has no
// "rename" for images — the description is what the console shows as the
// name of a snapshot.
func ImageUpdate(ctx context.Context, id int64, req types.ImageUpdateRequest) (*types.Image, error) {
	body := hetzner.ImageUpdateRequest{Labels: req.Labels}
	if req.Description != "" {
		body.Description = &req.Description
	}
	img, err := hcloud.ImageUpdate(ctx, id, body)
	if err != nil {
		return nil, err
	}
	out := toImage(*img)
	return &out, nil
}

// ImageDelete deletes a snapshot/backup that is not bound to a server.
func ImageDelete(ctx context.Context, id int64) error {
	if err := hcloud.ImageDelete(ctx, id); err != nil {
		return err
	}
	return nil
}

// ImageAction runs one allowlisted image action (change_protection).
func ImageAction(ctx context.Context, id int64, name string, body map[string]any) (*ActionResult, error) {
	protect, err := fieldBool(body, "protect")
	if err != nil {
		return nil, err
	}
	payload := struct {
		Delete bool `json:"delete"`
	}{Delete: protect}
	res, err := managedAction(ctx, "images", id, name, payload)
	if err != nil {
		return nil, err
	}
	return res, nil
}
