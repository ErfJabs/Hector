// Package routes registers every HTTP route of the panel. The file is the
// authoritative list of the API surface.
package routes

import (
	"github.com/gofiber/fiber/v2"

	"hector/backend/transport/api/handlers"
	"hector/backend/transport/api/middlewares"
)

func RegisterRoutes(app *fiber.App) {
	api := app.Group("/api")

	// public
	api.Post("/auth/login", handlers.Login)
	api.Get("/health", handlers.Health)

	// session required
	auth := api.Group("", middlewares.Auth)
	auth.Get("/auth/me", handlers.Me)

	auth.Get("/fleet", handlers.Fleet)

	auth.Get("/catalog", handlers.Catalog)

	auth.Post("/servers", handlers.ServerCreate)
	auth.Get("/servers/:id", handlers.ServerGet)
	auth.Put("/servers/:id", handlers.ServerRename)
	auth.Delete("/servers/:id", handlers.ServerDelete)
	auth.Get("/servers/:id/metrics", handlers.ServerMetrics)
	auth.Get("/servers/:id/snapshots", handlers.ServerSnapshots)
	auth.Post("/servers/:id/actions/:action", handlers.ServerAction)
	auth.Post("/servers/:id/rescale", handlers.ServerRescale)
	auth.Get("/servers/:id/job", handlers.ServerJob)

	auth.Get("/actions/:id", handlers.ActionGet)
}
