package routes

import (
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"

	"hector/backend/config"
)

// TestMain wires the process-wide config the handlers read. main always calls
// config.Load() first; without it Health would dereference a nil pointer.
func TestMain(m *testing.M) {
	config.Cfg = &config.Config{}
	os.Exit(m.Run())
}

// newApp builds the API exactly as main does (minus logging), so a route
// conflict — Fiber panics on one — fails the test instead of the binary.
func newApp(t *testing.T) *fiber.App {
	t.Helper()
	app := fiber.New(fiber.Config{DisableStartupMessage: true})
	RegisterRoutes(app)
	return app
}

// TestRegisterRoutesMatchesPublishedSurface pins the API surface. A new
// endpoint must be added here too, which is what keeps routes.go the
// authoritative list rather than a comment nobody checks.
func TestRegisterRoutesMatchesPublishedSurface(t *testing.T) {
	want := []string{
		"GET /api/health",
		"POST /api/auth/login",
		"GET /api/auth/me",
		"GET /api/fleet",
		"GET /api/catalog",

		"POST /api/servers",
		"GET /api/servers/:id",
		"PUT /api/servers/:id",
		"DELETE /api/servers/:id",
		"GET /api/servers/:id/metrics",
		"GET /api/servers/:id/snapshots",
		"POST /api/servers/:id/actions/:action",
		"POST /api/servers/:id/rescale",
		"GET /api/servers/:id/job",

		"GET /api/volumes",
		"POST /api/volumes",
		"GET /api/volumes/:id",
		"PUT /api/volumes/:id",
		"DELETE /api/volumes/:id",
		"POST /api/volumes/:id/actions/:action",

		"GET /api/networks",
		"POST /api/networks",
		"GET /api/networks/:id",
		"PUT /api/networks/:id",
		"DELETE /api/networks/:id",
		"POST /api/networks/:id/actions/:action",

		"GET /api/firewalls",
		"POST /api/firewalls",
		"GET /api/firewalls/:id",
		"PUT /api/firewalls/:id",
		"DELETE /api/firewalls/:id",
		"POST /api/firewalls/:id/actions/:action",

		"GET /api/floating-ips",
		"POST /api/floating-ips",
		"GET /api/floating-ips/:id",
		"PUT /api/floating-ips/:id",
		"DELETE /api/floating-ips/:id",
		"POST /api/floating-ips/:id/actions/:action",

		"GET /api/primary-ips",
		"POST /api/primary-ips",
		"GET /api/primary-ips/:id",
		"PUT /api/primary-ips/:id",
		"DELETE /api/primary-ips/:id",
		"POST /api/primary-ips/:id/actions/:action",

		"GET /api/load-balancers",
		"POST /api/load-balancers",
		"GET /api/load-balancers/:id",
		"PUT /api/load-balancers/:id",
		"DELETE /api/load-balancers/:id",
		"POST /api/load-balancers/:id/actions/:action",

		"GET /api/placement-groups",
		"POST /api/placement-groups",
		"PUT /api/placement-groups/:id",
		"DELETE /api/placement-groups/:id",

		"GET /api/certificates",
		"POST /api/certificates",
		"PUT /api/certificates/:id",
		"DELETE /api/certificates/:id",
		"POST /api/certificates/:id/retry",

		"GET /api/ssh-keys",
		"POST /api/ssh-keys",
		"PUT /api/ssh-keys/:id",
		"DELETE /api/ssh-keys/:id",

		"GET /api/images",
		"PUT /api/images/:id",
		"DELETE /api/images/:id",
		"POST /api/images/:id/actions/:action",

		"GET /api/activity",
		"GET /api/actions/:id",
	}

	app := newApp(t)

	var got []string
	for _, r := range app.GetRoutes() {
		if !strings.HasPrefix(r.Path, "/api") || r.Path == "/api" {
			continue // the bare "/api" entry is fiber's group prefix route
		}
		if r.Method == fiber.MethodHead {
			continue // fiber registers HEAD alongside every GET
		}
		got = append(got, r.Method+" "+r.Path)
	}
	sort.Strings(got)
	sort.Strings(want)

	if len(got) != len(want) {
		t.Fatalf("registered %d routes, want %d\nmissing: %v\nextra: %v",
			len(got), len(want), diff(want, got), diff(got, want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("route[%d] = %s, want %s", i, got[i], want[i])
		}
	}
}

// TestAuthMiddlewareGuardsEveryDataRoute proves the session middleware is
// actually in front of the resource endpoints: no token -> 401, and the two
// public endpoints still answer.
func TestAuthMiddlewareGuardsEveryDataRoute(t *testing.T) {
	app := newApp(t)

	unauth := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/fleet"},
		{http.MethodGet, "/api/volumes"},
		{http.MethodPost, "/api/volumes"},
		{http.MethodGet, "/api/networks"},
		{http.MethodGet, "/api/firewalls"},
		{http.MethodGet, "/api/floating-ips"},
		{http.MethodGet, "/api/primary-ips"},
		{http.MethodGet, "/api/load-balancers"},
		{http.MethodGet, "/api/placement-groups"},
		{http.MethodGet, "/api/certificates"},
		{http.MethodGet, "/api/ssh-keys"},
		{http.MethodGet, "/api/images"},
		{http.MethodGet, "/api/activity"},
	}
	for _, tc := range unauth {
		res, err := app.Test(httptest.NewRequest(tc.method, tc.path, nil))
		if err != nil {
			t.Fatalf("%s %s: %v", tc.method, tc.path, err)
		}
		if res.StatusCode != fiber.StatusUnauthorized {
			t.Errorf("%s %s = %d, want 401", tc.method, tc.path, res.StatusCode)
		}
	}

	for _, tc := range []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/health"},
		{http.MethodPost, "/api/auth/login"},
	} {
		res, err := app.Test(httptest.NewRequest(tc.method, tc.path, nil))
		if err != nil {
			t.Fatalf("%s %s: %v", tc.method, tc.path, err)
		}
		if res.StatusCode == fiber.StatusUnauthorized {
			t.Errorf("%s %s = 401, must stay public", tc.method, tc.path)
		}
	}
}

// diff returns the entries of a that are not in b.
func diff(a, b []string) []string {
	seen := map[string]bool{}
	for _, s := range b {
		seen[s] = true
	}
	var out []string
	for _, s := range a {
		if !seen[s] {
			out = append(out, s)
		}
	}
	return out
}
