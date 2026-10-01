package services

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"hector/backend/config"
)

var ErrInvalidCredentials = errors.New("wrong username or password")

const sessionTTL = 7 * 24 * time.Hour

// jwtSecret returns the configured secret or a process-random one (sessions
// then end at restart — fine for a single-admin panel, documented in .env.example).
var jwtSecretCache string

func jwtSecret() string {
	if jwtSecretCache != "" {
		return jwtSecretCache
	}
	if config.Cfg.JwtSecret != "" {
		jwtSecretCache = config.Cfg.JwtSecret
		return jwtSecretCache
	}
	raw := make([]byte, 32)
	_, _ = rand.Read(raw)
	jwtSecretCache = hex.EncodeToString(raw)
	return jwtSecretCache
}

// Login checks the single admin account and returns a signed session token.
//
// failures are throttled per client IP (see loginThrottle): the account is a
// single static password, so an unthrottled endpoint is a brute-force oracle.
// Only failures count — a correct password is never delayed.
func Login(username, password string, ip string) (string, error) {
	if ok, wait := loginGate.allow(ip); !ok {
		return "", &ErrThrottled{RetryAfter: wait}
	}

	userOK := subtle.ConstantTimeCompare([]byte(username), []byte(config.Cfg.AdminUsername)) == 1
	passOK := config.Cfg.AdminPassword != "" &&
		subtle.ConstantTimeCompare([]byte(password), []byte(config.Cfg.AdminPassword)) == 1
	if !userOK || !passOK {
		loginGate.fail(ip)
		return "", ErrInvalidCredentials
	}
	loginGate.success(ip)

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "admin",
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(sessionTTL).Unix(),
	})
	return token.SignedString([]byte(jwtSecret()))
}

// ---- login throttle ------------------------------------------------------

// ErrThrottled means too many failed sign-ins from this address inside the
// window. RetryAfter is how long the client should wait.
type ErrThrottled struct {
	RetryAfter time.Duration
}

func (e *ErrThrottled) Error() string {
	return "too many sign-in attempts, try again shortly"
}

const (
	loginWindow    = time.Minute
	loginMaxFails  = 5
	loginPruneSize = 1024
)

type loginAttempt struct {
	first  time.Time
	fails  int
}

// loginThrottle keeps a sliding window of failures per client IP. The map is
// pruned opportunistically so a flood of distinct source addresses cannot grow
// it without bound.
type loginThrottle struct {
	mu   sync.Mutex
	hits map[string]*loginAttempt
}

var loginGate = &loginThrottle{hits: map[string]*loginAttempt{}}

// allow reports whether a login from ip may be checked right now, and the
// wait to advertise when it may not.
func (t *loginThrottle) allow(ip string) (bool, time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.pruneLocked(time.Now())

	a := t.hits[ip]
	if a == nil || time.Since(a.first) >= loginWindow {
		return true, 0
	}
	if a.fails < loginMaxFails {
		return true, 0
	}
	// window resets at first+loginWindow; never ask for more than the window
	return false, loginWindow - time.Since(a.first)
}

func (t *loginThrottle) fail(ip string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	now := time.Now()
	a := t.hits[ip]
	if a == nil || now.Sub(a.first) >= loginWindow {
		t.hits[ip] = &loginAttempt{first: now, fails: 1}
		return
	}
	a.fails++
}

func (t *loginThrottle) success(ip string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.hits, ip)
}

func (t *loginThrottle) pruneLocked(now time.Time) {
	if len(t.hits) < loginPruneSize {
		return
	}
	for ip, a := range t.hits {
		if now.Sub(a.first) >= loginWindow {
			delete(t.hits, ip)
		}
	}
}

// CheckToken validates a session token from the Authorization header.
func CheckToken(raw string) error {
	token, err := jwt.Parse(raw, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(jwtSecret()), nil
	})
	if err != nil || !token.Valid {
		return ErrInvalidCredentials
	}
	return nil
}
