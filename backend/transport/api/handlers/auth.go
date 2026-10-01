package handlers

import (
	"errors"
	"strconv"

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
	token, err := services.Login(req.Username, req.Password, c.IP())
	if err != nil {
		var throttled *services.ErrThrottled
		if errors.As(err, &throttled) {
			if throttled.RetryAfter > 0 {
				c.Set(fiber.HeaderRetryAfter, strconv.Itoa(int(throttled.RetryAfter.Seconds())+1))
			}
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"message": "Too many sign-in attempts — wait a moment and try again",
				"code":    "too_many_attempts",
			})
		}
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
