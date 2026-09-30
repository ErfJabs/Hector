package handlers

import (
	"errors"
	"net"
	"net/url"

	"github.com/gofiber/fiber/v2"

	"hector/backend/config"
	"hector/backend/hetzner"
	"hector/backend/services"
)

// fail maps an error to the HTTP response. The frontend switches on `code`:
//   - "session"          -> sign in again
//   - "unauthorized"     -> Hetzner rejected the token (HCLOUD_TOKEN card)
//   - "token_missing"    -> HCLOUD_TOKEN is not configured
//   - "proxy"            -> the configured proxy (PROXY_URL) did not get through
//   - "unreachable"      -> api.hetzner.cloud did not answer
func fail(c *fiber.Ctx, err error) error {
	status := fiber.StatusInternalServerError
	code := ""

	var apiErr *hetzner.APIError
	var urlErr *url.Error
	var netErr net.Error

	switch {
	case errors.As(err, &apiErr):
		status = apiErr.Status
		code = apiErr.Code
	case errors.Is(err, hetzner.ErrNoToken):
		status, code = fiber.StatusUnauthorized, "token_missing"
	case errors.Is(err, services.ErrInvalidCredentials):
		status, code = fiber.StatusUnauthorized, "session"
	case errors.Is(err, services.ErrActionNotAllowed):
		status, code = fiber.StatusBadRequest, "action_not_allowed"
	case errors.Is(err, services.ErrJobRunning):
		status, code = fiber.StatusConflict, "job_running"
	case errors.As(err, &urlErr) || errors.As(err, &netErr):
		status = fiber.StatusBadGateway
		if config.Cfg.Proxy != "" {
			code = "proxy"
		} else {
			code = "unreachable"
		}
	}

	return c.Status(status).JSON(fiber.Map{
		"message": err.Error(),
		"code":    code,
	})
}

// parseBody decodes the JSON body into dst and answers 400 on failure.
func parseBody(c *fiber.Ctx, dst any) error {
	if err := c.BodyParser(dst); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}
	return nil
}
