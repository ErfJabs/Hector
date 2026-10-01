package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v2"

	"hector/backend/services"
	"hector/backend/types"
)

// paramID parses :id for every non-server resource. The message names no
// resource so one helper can serve them all.
func paramID(c *fiber.Ctx) (int64, error) {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return 0, fiber.NewError(fiber.StatusBadRequest, "Invalid id")
	}
	return id, nil
}

// actionBody reads the optional JSON body of an action call. An empty body
// is a valid payload (actions like detach need none).
func actionBody(c *fiber.Ctx) (map[string]any, error) {
	body := map[string]any{}
	if len(c.Body()) == 0 {
		return body, nil
	}
	if err := parseBody(c, &body); err != nil {
		return nil, err
	}
	return body, nil
}

// ---- volumes -----------------------------------------------------------

// Volumes — GET /api/volumes
func Volumes(c *fiber.Ctx) error {
	list, err := services.Volumes(c.Context())
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(list)
}

// VolumeGet — GET /api/volumes/:id
func VolumeGet(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	volume, err := services.Volume(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(volume)
}

// VolumeCreate — POST /api/volumes
func VolumeCreate(c *fiber.Ctx) error {
	var req types.VolumeCreateRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	volume, action, err := services.VolumeCreate(c.Context(), req)
	if err != nil {
		return fail(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"volume": volume, "action": action})
}

// VolumeUpdate — PUT /api/volumes/:id (rename and/or labels)
func VolumeUpdate(c *fiber.Ctx) error {
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
	volume, err := services.VolumeUpdate(c.Context(), id, req.Name, req.Labels)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(volume)
}

// VolumeDelete — DELETE /api/volumes/:id
func VolumeDelete(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.VolumeDelete(c.Context(), id)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}

// VolumeAction — POST /api/volumes/:id/actions/:action
func VolumeAction(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return fail(c, err)
	}
	body, err := actionBody(c)
	if err != nil {
		return fail(c, err)
	}
	res, err := services.VolumeAction(c.Context(), id, c.Params("action"), body)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(res)
}
