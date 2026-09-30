// Package frontend embeds the built Vite app and serves it with an SPA
// fallback. Build it with `make build` (or `cd frontend && npm run build`)
// before compiling the Go binary.
package frontend

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/filesystem"
)

//go:embed all:dist
var dist embed.FS

// Register serves the embedded bundle: real files when they exist, index.html
// for every other GET (client-side routing), and nothing under /api.
func Register(app *fiber.App) {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		log.Fatalf("[web] embedded frontend: %v", err)
	}

	app.Use(filesystem.New(filesystem.Config{
		Root:         http.FS(sub),
		Index:        "index.html",
		NotFoundFile: "index.html",
		Next: func(c *fiber.Ctx) bool {
			return strings.HasPrefix(c.Path(), "/api/")
		},
	}))
}
