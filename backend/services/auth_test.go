package services

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"hector/backend/config"
)

// resetLoginGate starts each throttle test from a clean slate — the gate is
// process-wide, and a leaked entry from a previous test would hide a bug.
func resetLoginGate() {
	loginGate = &loginThrottle{hits: map[string]*loginAttempt{}}
}

func TestLoginThrottleBlocksAfterMaxFails(t *testing.T) {
	resetLoginGate()
	ip := "203.0.113.7"

	for i := 1; i <= loginMaxFails; i++ {
		if ok, _ := loginGate.allow(ip); !ok {
			t.Fatalf("blocked after %d failures, want %d allowed", i, loginMaxFails)
		}
		loginGate.fail(ip)
	}

	ok, wait := loginGate.allow(ip)
	if ok {
		t.Fatal("still allowed after reaching the failure limit")
	}
	if wait <= 0 || wait > loginWindow {
		t.Errorf("wait = %s, want (0, 1m]", wait)
	}

	// A different client address is unaffected.
	if other, _ := loginGate.allow("198.51.100.4"); !other {
		t.Error("one address must not throttle another")
	}
}

func TestLoginThrottleSuccessClearsFailures(t *testing.T) {
	resetLoginGate()
	ip := "203.0.113.8"

	for i := 0; i < loginMaxFails; i++ {
		loginGate.fail(ip)
	}
	if ok, _ := loginGate.allow(ip); ok {
		t.Fatal("expected the address to be throttled")
	}

	loginGate.success(ip)
	if ok, _ := loginGate.allow(ip); !ok {
		t.Error("a successful sign-in must clear the failure counter")
	}
	if loginGate.hits[ip] != nil {
		t.Error("entry must be removed after a successful sign-in")
	}
}

func TestLoginThrottleWindowSlidesForward(t *testing.T) {
	resetLoginGate()
	ip := "203.0.113.9"

	for i := 0; i < loginMaxFails; i++ {
		loginGate.fail(ip)
	}
	// Age the failures past the window: the block must expire on its own.
	loginGate.hits[ip].first = time.Now().Add(-loginWindow - time.Second)

	if ok, _ := loginGate.allow(ip); !ok {
		t.Error("the block must lift once the window has passed")
	}

	// A fresh failure inside a new window starts counting from one again.
	loginGate.fail(ip)
	if got := loginGate.hits[ip].fails; got != 1 {
		t.Errorf("fails = %d after the window reset, want 1", got)
	}
}

func TestLoginThrottlePrunesStaleEntries(t *testing.T) {
	resetLoginGate()
	now := time.Now()
	for i := 0; i < loginPruneSize; i++ {
		loginGate.hits[ipOf(i)] = &loginAttempt{first: now.Add(-2 * loginWindow), fails: 3}
	}
	loginGate.hits["192.0.2.99"] = &loginAttempt{first: now, fails: 2}

	// allow() is the read path every sign-in takes, so pruning there is what
	// keeps a flood of source addresses from growing the map forever.
	loginGate.allow("192.0.2.99")

	if len(loginGate.hits) >= loginPruneSize {
		t.Errorf("stale entries were not pruned: %d remain", len(loginGate.hits))
	}
	if loginGate.hits["192.0.2.99"] == nil {
		t.Error("a fresh entry must survive pruning")
	}
}

// ipOf makes distinct, stable addresses for the prune test.
func ipOf(i int) string { return fmt.Sprintf("10.0.%d.%d", i/256, i%256) }

func TestLoginReturnsThrottledError(t *testing.T) {
	resetLoginGate()
	config.Cfg = &config.Config{AdminUsername: "admin", AdminPassword: "correct-horse"}

	for i := 0; i < loginMaxFails; i++ {
		if _, err := Login("admin", "wrong", "192.0.2.10"); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("attempt %d: err = %v, want ErrInvalidCredentials", i+1, err)
		}
	}

	_, err := Login("admin", "correct-horse", "192.0.2.10")
	var throttled *ErrThrottled
	if !errors.As(err, &throttled) {
		t.Fatalf("err = %v, want *ErrThrottled", err)
	}
	if throttled.RetryAfter <= 0 {
		t.Errorf("RetryAfter = %s, want a positive wait", throttled.RetryAfter)
	}

	// Another address still signs in with the right password.
	if _, err := Login("admin", "correct-horse", "192.0.2.11"); err != nil {
		t.Errorf("clean address: %v", err)
	}
}

func TestLoginAcceptsCorrectCredentials(t *testing.T) {
	resetLoginGate()
	config.Cfg = &config.Config{AdminUsername: "admin", AdminPassword: "correct-horse", JwtSecret: "unit-test-secret"}

	token, err := Login("admin", "correct-horse", "198.51.100.9")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if token == "" {
		t.Fatal("Login returned an empty token")
	}
	if err := CheckToken(token); err != nil {
		t.Errorf("CheckToken: %v", err)
	}

	if _, err := Login("admin", "nope", "198.51.100.9"); !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("wrong password: %v", err)
	}
	if _, err := Login("nobody", "correct-horse", "198.51.100.9"); !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("wrong user: %v", err)
	}

	// An unset password must never match, even when the input is empty.
	config.Cfg.AdminPassword = ""
	if _, err := Login("admin", "", "198.51.100.9"); !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("empty configured password: %v", err)
	}
}
