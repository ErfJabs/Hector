package handlers

import (
	"github.com/gofiber/fiber/v2"

	"hector/backend/hetzner"
	"hector/backend/services"
	"hector/backend/types"
)

// ---- placement groups --------------------------------------------------

// PlacementGroups — GET /api/placement-groups
func PlacementGroups(c *fiber.Ctx) error {
	list, err := services.PlacementGroups(c.Context())
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(list)
}

// PlacementGroupCreate — POST /api/placement-groups
func PlacementGroupCreate(c *fiber.Ctx) error {
	var req types.PlacementGroupCreateRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	item, err := services.PlacementGroupCreate(c.Context(), req)
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"placementGroup": item})
}

// PlacementGroupUpdate — PUT /api/placement-groups/:id
func PlacementGroupUpdate(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	var req struct {
		Name   string            `json:"name"`
		Labels map[string]string `json:"labels"`
	}
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	item, err := services.PlacementGroupUpdate(c.Context(), id, req.Name, req.Labels)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(item)
}

// PlacementGroupDelete — DELETE /api/placement-groups/:id
func PlacementGroupDelete(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	if err := services.PlacementGroupDelete(c.Context(), id); err != nil {
		return fail(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ---- certificates ------------------------------------------------------

// Certificates — GET /api/certificates
func Certificates(c *fiber.Ctx) error {
	list, err := services.Certificates(c.Context())
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(list)
}

// CertificateCreate — POST /api/certificates
func CertificateCreate(c *fiber.Ctx) error {
	var req types.CertificateCreateRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	item, action, err := services.CertificateCreate(c.Context(), req)
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"certificate": item, "action": action})
}

// CertificateUpdate — PUT /api/certificates/:id
func CertificateUpdate(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	var req struct {
		Name   string            `json:"name"`
		Labels map[string]string `json:"labels"`
	}
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	item, err := services.CertificateUpdate(c.Context(), id, req.Name, req.Labels)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(item)
}

// CertificateDelete — DELETE /api/certificates/:id
func CertificateDelete(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	if err := services.CertificateDelete(c.Context(), id); err != nil {
		return fail(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// CertificateRetry — POST /api/certificates/:id/retry
func CertificateRetry(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.CertificateRetry(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}

// ---- SSH keys ----------------------------------------------------------

// SSHKeys — GET /api/ssh-keys
func SSHKeys(c *fiber.Ctx) error {
	list, err := services.SSHKeys(c.Context())
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(list)
}

// SSHKeyCreate — POST /api/ssh-keys
func SSHKeyCreate(c *fiber.Ctx) error {
	var req types.SSHKeyCreateRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	item, err := services.SSHKeyCreate(c.Context(), req)
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"sshKey": item})
}

// SSHKeyUpdate — PUT /api/ssh-keys/:id
func SSHKeyUpdate(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	var req struct {
		Name   string            `json:"name"`
		Labels map[string]string `json:"labels"`
	}
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	item, err := services.SSHKeyUpdate(c.Context(), id, req.Name, req.Labels)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(item)
}

// SSHKeyDelete — DELETE /api/ssh-keys/:id
func SSHKeyDelete(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	if err := services.SSHKeyDelete(c.Context(), id); err != nil {
		return fail(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ---- images ------------------------------------------------------------

// Images — GET /api/images?type=&status=&name=&arch=
func Images(c *fiber.Ctx) error {
	f := hetzner.ImageFilter{
		Type:         c.Query("type"),
		Status:       c.Query("status"),
		Name:         c.Query("name"),
		Architecture: c.Query("arch"),
	}
	list, err := services.Images(c.Context(), f)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(list)
}

// ImageUpdate — PUT /api/images/:id (description and labels)
func ImageUpdate(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	var req types.ImageUpdateRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	item, err := services.ImageUpdate(c.Context(), id, req)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(item)
}

// ImageDelete — DELETE /api/images/:id
func ImageDelete(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	if err := services.ImageDelete(c.Context(), id); err != nil {
		return fail(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ImageAction — POST /api/images/:id/actions/:action
func ImageAction(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	body, err := actionBody(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.ImageAction(c.Context(), id, c.Params("action"), body)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}

// ---- activity ----------------------------------------------------------

// Activity — GET /api/activity
func Activity(c *fiber.Ctx) error {
	feed, err := services.Activity(c.Context())
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(feed)
}
