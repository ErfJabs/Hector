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

	// storage
	auth.Get("/volumes", handlers.Volumes)
	auth.Post("/volumes", handlers.VolumeCreate)
	auth.Get("/volumes/:id", handlers.VolumeGet)
	auth.Put("/volumes/:id", handlers.VolumeUpdate)
	auth.Delete("/volumes/:id", handlers.VolumeDelete)
	auth.Post("/volumes/:id/actions/:action", handlers.VolumeAction)

	// private networking
	auth.Get("/networks", handlers.Networks)
	auth.Post("/networks", handlers.NetworkCreate)
	auth.Get("/networks/:id", handlers.NetworkGet)
	auth.Put("/networks/:id", handlers.NetworkUpdate)
	auth.Delete("/networks/:id", handlers.NetworkDelete)
	auth.Post("/networks/:id/actions/:action", handlers.NetworkAction)

	// firewalls
	auth.Get("/firewalls", handlers.Firewalls)
	auth.Post("/firewalls", handlers.FirewallCreate)
	auth.Get("/firewalls/:id", handlers.FirewallGet)
	auth.Put("/firewalls/:id", handlers.FirewallUpdate)
	auth.Delete("/firewalls/:id", handlers.FirewallDelete)
	auth.Post("/firewalls/:id/actions/:action", handlers.FirewallAction)

	// addresses
	auth.Get("/floating-ips", handlers.FloatingIPs)
	auth.Post("/floating-ips", handlers.FloatingIPCreate)
	auth.Get("/floating-ips/:id", handlers.FloatingIPGet)
	auth.Put("/floating-ips/:id", handlers.FloatingIPUpdate)
	auth.Delete("/floating-ips/:id", handlers.FloatingIPDelete)
	auth.Post("/floating-ips/:id/actions/:action", handlers.FloatingIPAction)

	auth.Get("/primary-ips", handlers.PrimaryIPs)
	auth.Post("/primary-ips", handlers.PrimaryIPCreate)
	auth.Get("/primary-ips/:id", handlers.PrimaryIPGet)
	auth.Put("/primary-ips/:id", handlers.PrimaryIPUpdate)
	auth.Delete("/primary-ips/:id", handlers.PrimaryIPDelete)
	auth.Post("/primary-ips/:id/actions/:action", handlers.PrimaryIPAction)

	// load balancing
	auth.Get("/load-balancers", handlers.LoadBalancers)
	auth.Post("/load-balancers", handlers.LoadBalancerCreate)
	auth.Get("/load-balancers/:id", handlers.LoadBalancerGet)
	auth.Put("/load-balancers/:id", handlers.LoadBalancerUpdate)
	auth.Delete("/load-balancers/:id", handlers.LoadBalancerDelete)
	auth.Post("/load-balancers/:id/actions/:action", handlers.LoadBalancerAction)

	// placement
	auth.Get("/placement-groups", handlers.PlacementGroups)
	auth.Post("/placement-groups", handlers.PlacementGroupCreate)
	auth.Put("/placement-groups/:id", handlers.PlacementGroupUpdate)
	auth.Delete("/placement-groups/:id", handlers.PlacementGroupDelete)

	// access
	auth.Get("/certificates", handlers.Certificates)
	auth.Post("/certificates", handlers.CertificateCreate)
	auth.Put("/certificates/:id", handlers.CertificateUpdate)
	auth.Delete("/certificates/:id", handlers.CertificateDelete)
	auth.Post("/certificates/:id/retry", handlers.CertificateRetry)

	auth.Get("/ssh-keys", handlers.SSHKeys)
	auth.Post("/ssh-keys", handlers.SSHKeyCreate)
	auth.Put("/ssh-keys/:id", handlers.SSHKeyUpdate)
	auth.Delete("/ssh-keys/:id", handlers.SSHKeyDelete)

	// images
	auth.Get("/images", handlers.Images)
	auth.Put("/images/:id", handlers.ImageUpdate)
	auth.Delete("/images/:id", handlers.ImageDelete)
	auth.Post("/images/:id/actions/:action", handlers.ImageAction)

	// activity
	auth.Get("/activity", handlers.Activity)

	auth.Get("/actions/:id", handlers.ActionGet)
}
