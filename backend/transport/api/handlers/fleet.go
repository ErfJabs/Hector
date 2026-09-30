package handlers

import (
	"github.com/gofiber/fiber/v2"

	"hector/backend/services"
)

// Fleet — GET /api/fleet?fresh=1
func Fleet(c *fiber.Ctx) error {
	fresh := c.Query("fresh") == "1"
	fleet, err := services.Fleet(c.Context(), fresh)
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(fleet)
}
