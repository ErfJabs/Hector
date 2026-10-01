package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"

	"hector/backend/hetzner"
	"hector/backend/services"
)

// run maps one error through fail() on a throwaway app and returns the
// response, so every branch of the mapping can be asserted directly.
func run(t *testing.T, err error) *http.Response {
	t.Helper()
	app := fiber.New()
	app.Get("/boom", func(c *fiber.Ctx) error { return fail(c, err) })

	res, reqErr := app.Test(httptest.NewRequest(http.MethodGet, "/boom", nil))
	if reqErr != nil {
		t.Fatalf("app.Test: %v", reqErr)
	}
	return res
}

func decodeError(t *testing.T, res *http.Response) (string, string) {
	t.Helper()
	raw, _ := io.ReadAll(res.Body)
	var body struct {
		Message string `json:"message"`
		Code    string `json:"code"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatalf("decode %q: %v", raw, err)
	}
	return body.Code, body.Message
}

func TestFailMapsRateLimitToRetryAfter(t *testing.T) {
	reset := time.Now().Add(90 * time.Second).Truncate(time.Second)
	res := run(t, &hetzner.RateLimitedError{Reset: reset})
	defer res.Body.Close()

	if res.StatusCode != fiber.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", res.StatusCode)
	}
	code, _ := decodeError(t, res)
	if code != "rate_limited" {
		t.Errorf("code = %q, want rate_limited", code)
	}
	if got := res.Header.Get("Retry-After"); got != "90" {
		t.Errorf("Retry-After = %q, want 90", got)
	}
}

func TestFailMapsAPIError(t *testing.T) {
	res := run(t, &hetzner.APIError{
		Status:  fiber.StatusUnprocessableEntity,
		Code:    "resource_in_use",
		Message: "server is attached",
	})
	defer res.Body.Close()

	if res.StatusCode != fiber.StatusUnprocessableEntity {
		t.Errorf("status = %d, want 422", res.StatusCode)
	}
	code, msg := decodeError(t, res)
	if code != "resource_in_use" {
		t.Errorf("code = %q, want resource_in_use", code)
	}
	if !strings.Contains(msg, "server is attached") {
		t.Errorf("message = %q, want it to carry the API text", msg)
	}
}

func TestFailMapsKnownCodes(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"no token", hetzner.ErrNoToken, fiber.StatusUnauthorized, "token_missing"},
		{"bad credentials", services.ErrInvalidCredentials, fiber.StatusUnauthorized, "session"},
		{"action denied", services.ErrActionNotAllowed, fiber.StatusBadRequest, "action_not_allowed"},
		{"job running", services.ErrJobRunning, fiber.StatusConflict, "job_running"},
		{"bad field", services.ErrBadField, fiber.StatusInternalServerError, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := run(t, tc.err)
			defer res.Body.Close()
			if res.StatusCode != tc.status {
				t.Errorf("status = %d, want %d", res.StatusCode, tc.status)
			}
			code, _ := decodeError(t, res)
			if code != tc.code {
				t.Errorf("code = %q, want %q", code, tc.code)
			}
		})
	}
}

func TestFailKeepsPlainErrorsAt500(t *testing.T) {
	res := run(t, errors.New("something broke"))
	defer res.Body.Close()

	if res.StatusCode != fiber.StatusInternalServerError {
		t.Errorf("status = %d, want 500", res.StatusCode)
	}
	code, msg := decodeError(t, res)
	if code != "" || msg != "something broke" {
		t.Errorf("code=%q message=%q", code, msg)
	}
}

func TestParseBodyRejectsMalformedJSON(t *testing.T) {
	app := fiber.New()
	app.Post("/x", func(c *fiber.Ctx) error {
		var dst map[string]any
		return parseBody(c, &dst)
	})

	req := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader("{not json"))
	req.Header.Set("Content-Type", "application/json")
	res, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if res.StatusCode != fiber.StatusBadRequest {
		t.Errorf("status = %d, want 400", res.StatusCode)
	}
}
