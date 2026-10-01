package handlers

import (
	"github.com/gofiber/fiber/v2"

	"hector/backend/services"
	"hector/backend/types"
)

// ---- networks ----------------------------------------------------------

// Networks — GET /api/networks
func Networks(c *fiber.Ctx) error {
	list, err := services.Networks(c.Context())
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(list)
}

// NetworkGet — GET /api/networks/:id (network + its members)
func NetworkGet(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	network, members, err := services.Network(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(fiber.Map{"network": network, "members": members})
}

// NetworkCreate — POST /api/networks
func NetworkCreate(c *fiber.Ctx) error {
	var req types.NetworkCreateRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	network, err := services.NetworkCreate(c.Context(), req)
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"network": network})
}

// NetworkUpdate — PUT /api/networks/:id
func NetworkUpdate(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	var req types.NetworkUpdateRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	network, err := services.NetworkUpdate(c.Context(), id, req)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(network)
}

// NetworkDelete — DELETE /api/networks/:id
func NetworkDelete(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.NetworkDelete(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}

// NetworkAction — POST /api/networks/:id/actions/:action
func NetworkAction(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	body, err := actionBody(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.NetworkAction(c.Context(), id, c.Params("action"), body)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}

// ---- firewalls ---------------------------------------------------------

// Firewalls — GET /api/firewalls
func Firewalls(c *fiber.Ctx) error {
	list, err := services.Firewalls(c.Context())
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(list)
}

// FirewallGet — GET /api/firewalls/:id
func FirewallGet(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	firewall, err := services.Firewall(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(firewall)
}

// FirewallCreate — POST /api/firewalls
func FirewallCreate(c *fiber.Ctx) error {
	var req types.FirewallCreateRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	firewall, action, err := services.FirewallCreate(c.Context(), req)
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"firewall": firewall, "action": action})
}

// FirewallUpdate — PUT /api/firewalls/:id
func FirewallUpdate(c *fiber.Ctx) error {
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
	firewall, err := services.FirewallUpdate(c.Context(), id, req.Name, req.Labels)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(firewall)
}

// FirewallDelete — DELETE /api/firewalls/:id
func FirewallDelete(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	if err := services.FirewallDelete(c.Context(), id); err != nil {
		return fail(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// FirewallAction — POST /api/firewalls/:id/actions/:action
func FirewallAction(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	body, err := actionBody(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.FirewallAction(c.Context(), id, c.Params("action"), body)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}
