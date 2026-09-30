package handlers

import (
	"github.com/gofiber/fiber/v2"

	"hector/backend/services"
)

// Catalog — GET /api/catalog
func Catalog(c *fiber.Ctx) error {
	cat, err := services.Catalog(c.Context())
	if err != nil {
		return fail(c, err)
	}
	return c.JSON(cat)
}
