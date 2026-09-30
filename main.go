package main

import (
	"context"
	"errors"
	"log"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"

	"hector/backend/config"
	"hector/backend/hetzner"
	"hector/backend/services"
	apiRoutes "hector/backend/transport/api/routes"
	"hector/frontend"
)

func main() {
	log.Println("[app] Hector starting")

	config.Load()

	client, err := hetzner.New(config.Cfg.CloudToken, config.Cfg.Proxy, config.Cfg.CloudAPIURL)
	if err != nil {
		log.Fatalf("[cfg] %v", err)
	}
	services.Init(client)
	log.Printf("[hetzner] client ready (token: %v, proxy: %v)", client.Configured(), config.Cfg.Proxy != "")
	logProbe(client.Probe(context.Background()))

	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		// A handler that already wrote its response before returning an error
		// keeps it; everything unwritten gets the usual status treatment.
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			if len(c.Response().Body()) > 0 {
				return nil
			}
			code := fiber.StatusInternalServerError
			var fe *fiber.Error
			if errors.As(err, &fe) {
				code = fe.Code
			}
			c.Set(fiber.HeaderContentType, fiber.MIMETextPlainCharsetUTF8)
			return c.Status(code).SendString(err.Error())
		},
	})
	app.Use(logger.New())

	apiRoutes.RegisterRoutes(app)
	log.Println("[api] routes registered")
	frontend.Register(app)
	log.Println("[web] frontend registered")

	address := config.Cfg.ApiHost + ":" + strconv.Itoa(config.Cfg.ApiPort)
	log.Printf("[api] listening on %s", address)
	log.Fatal(app.Listen(address))
}

// logProbe reports the boot-time connectivity check in the server log:
// proxy reachable?, Hetzner API reachable through it?, token accepted?
// It never stops the boot — the panel shows the same problems in the UI.
func logProbe(r hetzner.ProbeReport) {
	ms := func(d time.Duration) int64 { return d.Milliseconds() }
	route := "direct"
	if r.Proxy != "" {
		route = "via " + r.Proxy
		if !r.ProxyOK {
			log.Printf("[proxy] FAIL  %s unreachable after %d ms: %v", r.Proxy, ms(r.ProxyTime), r.ProxyErr)
			log.Printf("[proxy]       check PROXY_URL and that the proxy is running — every Hetzner call will fail (no direct fallback)")
			return
		}
		log.Printf("[proxy] OK    %s accepts connections (%d ms)", r.Proxy, ms(r.ProxyTime))
	} else {
		log.Printf("[proxy] none  PROXY_URL is empty — connecting to Hetzner directly")
	}

	switch {
	case r.APIErr != nil:
		log.Printf("[proxy] FAIL  %s %s: no answer after %d ms: %v", r.APIHost, route, ms(r.APITime), r.APIErr)
		if r.Proxy != "" {
			log.Printf("[proxy]       the proxy is up but did not get through to %s (wrong protocol/port, bad credentials, or blocked)", r.APIHost)
		}
	case r.APIStatus == 407:
		log.Printf("[proxy] FAIL  %s rejected the username/password (HTTP 407) — check the credentials in PROXY_URL", r.Proxy)
	case r.APIStatus == 401:
		log.Printf("[proxy] OK    %s %s answers (HTTP 401, %d ms) — but HCLOUD_TOKEN is missing or rejected", r.APIHost, route, ms(r.APITime))
	case r.APIStatus >= 400:
		log.Printf("[proxy] WARN  %s %s answered HTTP %d (%d ms)", r.APIHost, route, r.APIStatus, ms(r.APITime))
	default:
		log.Printf("[proxy] OK    %s %s answers (HTTP %d, %d ms), token accepted", r.APIHost, route, r.APIStatus, ms(r.APITime))
	}

	if r.Proxy != "" {
		if r.ExitIP != "" {
			log.Printf("[proxy] OK    exit IP through the proxy: %s", r.ExitIP)
		} else if r.ExitErr != nil {
			log.Printf("[proxy] WARN  exit IP check failed: %v", r.ExitErr)
		}
	}
}
