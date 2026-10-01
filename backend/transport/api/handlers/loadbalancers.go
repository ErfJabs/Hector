package handlers

import (
	"github.com/gofiber/fiber/v2"

	"hector/backend/services"
	"hector/backend/types"
)

// ---- load balancers ----------------------------------------------------

// LoadBalancers — GET /api/load-balancers
func LoadBalancers(c *fiber.Ctx) error {
	list, err := services.LoadBalancers(c.Context())
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(list)
}

// LoadBalancerGet — GET /api/load-balancers/:id (with recent actions)
func LoadBalancerGet(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	item, err := services.LoadBalancer(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(item)
}

// LoadBalancerCreate — POST /api/load-balancers
func LoadBalancerCreate(c *fiber.Ctx) error {
	var req types.LoadBalancerCreateRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	item, action, err := services.LoadBalancerCreate(c.Context(), req)
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"loadBalancer": item, "action": action})
}

// LoadBalancerUpdate — PUT /api/load-balancers/:id
func LoadBalancerUpdate(c *fiber.Ctx) error {
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
	item, err := services.LoadBalancerUpdate(c.Context(), id, req.Name, req.Labels)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(item)
}

// LoadBalancerDelete — DELETE /api/load-balancers/:id
func LoadBalancerDelete(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.LoadBalancerDelete(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}

// LoadBalancerAction — POST /api/load-balancers/:id/actions/:action
func LoadBalancerAction(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	body, err := actionBody(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.LoadBalancerAction(c.Context(), id, c.Params("action"), body)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}
