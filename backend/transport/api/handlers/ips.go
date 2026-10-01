package handlers

import (
	"github.com/gofiber/fiber/v2"

	"hector/backend/services"
	"hector/backend/types"
)

// ---- floating IPs ------------------------------------------------------

// FloatingIPs — GET /api/floating-ips
func FloatingIPs(c *fiber.Ctx) error {
	list, err := services.FloatingIPs(c.Context())
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(list)
}

// FloatingIPGet — GET /api/floating-ips/:id
func FloatingIPGet(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	item, err := services.FloatingIP(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(item)
}

// FloatingIPCreate — POST /api/floating-ips
func FloatingIPCreate(c *fiber.Ctx) error {
	var req types.FloatingIPCreateRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	item, action, err := services.FloatingIPCreate(c.Context(), req)
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"floatingIp": item, "action": action})
}

// FloatingIPUpdate — PUT /api/floating-ips/:id
func FloatingIPUpdate(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	var req struct {
		Name        string            `json:"name"`
		Description string            `json:"description"`
		Labels      map[string]string `json:"labels"`
	}
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	item, err := services.FloatingIPUpdate(c.Context(), id, req.Name, req.Description, req.Labels)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(item)
}

// FloatingIPDelete — DELETE /api/floating-ips/:id
func FloatingIPDelete(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.FloatingIPDelete(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}

// FloatingIPAction — POST /api/floating-ips/:id/actions/:action
func FloatingIPAction(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	body, err := actionBody(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.FloatingIPAction(c.Context(), id, c.Params("action"), body)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}

// ---- primary IPs -------------------------------------------------------

// PrimaryIPs — GET /api/primary-ips
func PrimaryIPs(c *fiber.Ctx) error {
	list, err := services.PrimaryIPs(c.Context())
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(list)
}

// PrimaryIPGet — GET /api/primary-ips/:id
func PrimaryIPGet(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	item, err := services.PrimaryIP(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(item)
}

// PrimaryIPCreate — POST /api/primary-ips
func PrimaryIPCreate(c *fiber.Ctx) error {
	var req types.PrimaryIPCreateRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	item, action, err := services.PrimaryIPCreate(c.Context(), req)
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"primaryIp": item, "action": action})
}

// PrimaryIPUpdate — PUT /api/primary-ips/:id
func PrimaryIPUpdate(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	var req struct {
		Name       string            `json:"name"`
		Labels     map[string]string `json:"labels"`
		AutoDelete bool              `json:"autoDelete"`
	}
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	item, err := services.PrimaryIPUpdate(c.Context(), id, req.Name, req.Labels, req.AutoDelete)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(item)
}

// PrimaryIPDelete — DELETE /api/primary-ips/:id
func PrimaryIPDelete(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.PrimaryIPDelete(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}

// PrimaryIPAction — POST /api/primary-ips/:id/actions/:action
func PrimaryIPAction(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	body, err := actionBody(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.PrimaryIPAction(c.Context(), id, c.Params("action"), body)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}
