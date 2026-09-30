package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v2"

	"hector/backend/services"
	"hector/backend/types"
)

func serverID(c *fiber.Ctx) (int64, error) {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return 0, fiber.NewError(fiber.StatusBadRequest, "Invalid server id")
	}
	return id, nil
}

// ServerGet — GET /api/servers/:id
func ServerGet(c *fiber.Ctx) error {
	id, err := serverID(c)
	if err != nil {
		return fail(c, err)
	}
	detail, err := services.Server(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(detail)
}

type renameRequest struct {
	Name string `json:"name"`
}

// ServerRename — PUT /api/servers/:id
func ServerRename(c *fiber.Ctx) error {
	id, err := serverID(c)
	if err != nil {
		return fail(c, err)
	}
	var req renameRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	if req.Name == "" {
		return fail(c, fiber.NewError(fiber.StatusBadRequest, "name is required"))
	}
	detail, err := services.ServerRename(c.Context(), id, req.Name)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(detail)
}

// ServerDelete — DELETE /api/servers/:id
func ServerDelete(c *fiber.Ctx) error {
	id, err := serverID(c)
	if err != nil {
		return fail(c, err)
	}
	action, err := services.ServerDelete(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(fiber.Map{"action": action})
}

// ServerCreate — POST /api/servers
func ServerCreate(c *fiber.Ctx) error {
	var req types.CreateRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	res, err := services.ServerCreate(c.Context(), req)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}

// ServerMetrics — GET /api/servers/:id/metrics?range=24H
func ServerMetrics(c *fiber.Ctx) error {
	id, err := serverID(c)
	if err != nil {
		return fail(c, err)
	}
	view, err := services.ServerMetrics(c.Context(), id, c.Query("range", "24H"))
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(view)
}

// ServerSnapshots — GET /api/servers/:id/snapshots (delete confirmation)
func ServerSnapshots(c *fiber.Ctx) error {
	id, err := serverID(c)
	if err != nil {
		return fail(c, err)
	}
	info, err := services.Snapshots(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(info)
}

// ServerAction — POST /api/servers/:id/actions/:action
func ServerAction(c *fiber.Ctx) error {
	id, err := serverID(c)
	if err != nil {
		return fail(c, err)
	}

	payload := map[string]any{}
	if len(c.Body()) > 0 {
		if err := parseBody(c, &payload); err != nil {
			return fail(c, err)
		}
	}

	res, err := services.ServerAction(c.Context(), id, c.Params("action"), payload)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}

// ActionGet — GET /api/actions/:id (toast progress polling)
func ActionGet(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return fail(c, fiber.NewError(fiber.StatusBadRequest, "Invalid action id"))
	}
	action, err := services.Action(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(action)
}

type rescaleRequest struct {
	ServerType  string `json:"serverType"`
	UpgradeDisk bool   `json:"upgradeDisk"`
}

// ServerRescale — POST /api/servers/:id/rescale (multi-step job)
func ServerRescale(c *fiber.Ctx) error {
	id, err := serverID(c)
	if err != nil {
		return fail(c, err)
	}
	var req rescaleRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	job, err := services.Rescale(c.Context(), id, req.ServerType, req.UpgradeDisk)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(job)
}

// ServerJob — GET /api/servers/:id/job
func ServerJob(c *fiber.Ctx) error {
	id, err := serverID(c)
	if err != nil {
		return fail(c, err)
	}
	job := services.CurrentJob(id)
	if job == nil {
		return c.JSON(nil)
	}
	return c.JSON(job)
}
