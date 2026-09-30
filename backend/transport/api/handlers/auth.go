package handlers

import (
	"errors"

	"github.com/gofiber/fiber/v2"

	"hector/backend/config"
	"hector/backend/services"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Login — POST /api/auth/login
func Login(c *fiber.Ctx) error {
	var req loginRequest
	if err := parseBody(c, &req); err != nil {
		return fail(c, err)
	}
	token, err := services.Login(req.Username, req.Password)
	if err != nil {
		if errors.Is(err, services.ErrInvalidCredentials) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"message": "Wrong username or password",
				"code":    "invalid_credentials",
			})
		}
		return fail(c, err)
	}
	return c.JSON(fiber.Map{"token": token})
}

// Me — GET /api/auth/me (reached only with a valid session)
func Me(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"ok": true})
}

// Health — GET /api/health, public: what is wired up on this instance.
func Health(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"ok":                true,
		"loginConfigured":   config.Cfg.AdminPassword != "",
		"hetznerConfigured": services.Ready(),
	})
}
