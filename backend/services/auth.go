package services

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
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
func Login(username, password string) (string, error) {
	userOK := subtle.ConstantTimeCompare([]byte(username), []byte(config.Cfg.AdminUsername)) == 1
	passOK := config.Cfg.AdminPassword != "" &&
		subtle.ConstantTimeCompare([]byte(password), []byte(config.Cfg.AdminPassword)) == 1
	if !userOK || !passOK {
		return "", ErrInvalidCredentials
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "admin",
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(sessionTTL).Unix(),
	})
	return token.SignedString([]byte(jwtSecret()))
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
