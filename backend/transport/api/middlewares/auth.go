package middlewares

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"hector/backend/services"
)

// Auth requires a valid session token: `Authorization: Bearer <token>`.
func Auth(c *fiber.Ctx) error {
	header := c.Get(fiber.HeaderAuthorization)
	token, ok := strings.CutPrefix(header, "Bearer ")
	if !ok || strings.TrimSpace(token) == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "Sign in required",
			"code":    "session",
		})
	}
	if err := services.CheckToken(strings.TrimSpace(token)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "Session expired",
			"code":    "session",
		})
	}
	return c.Next()
}
