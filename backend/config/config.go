// Package config loads environment configuration (plus an optional .env file
// in the working directory). No config file format, no dependencies.
package config

import (
	"bufio"
	"log"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	ApiHost string
	ApiPort int

	// Hetzner Cloud API token (read + write). Empty = the panel boots but
	// every /api call that needs Hetzner fails with a clear error.
	CloudToken string
	// Optional proxy for every outgoing api.hetzner.cloud request (PROXY_URL,
	// or the older SOCKS_PROXY): socks5://user:pass@host:port,
	// http://user:pass@host:port, or bare host:port (= SOCKS5). When set,
	// nothing ever goes out directly.
	Proxy string
	// Optional API base override (development against a local mock).
	CloudAPIURL string

	// The single admin account.
	AdminUsername string
	AdminPassword string
	// HS256 secret; empty generates a random one (sessions die on restart).
	JwtSecret string
}

// Cfg is the process-wide configuration, loaded once in main.
var Cfg *Config

func Load() {
	loadDotEnv(".env")

	Cfg = &Config{
		ApiHost:       getEnv("API_HOST", "0.0.0.0"),
		ApiPort:       getEnvInt("API_PORT", 8787),
		CloudToken:    os.Getenv("HCLOUD_TOKEN"),
		Proxy:         firstEnv("PROXY_URL", "SOCKS_PROXY"),
		CloudAPIURL:   os.Getenv("HCLOUD_API_URL"),
		AdminUsername: getEnv("ADMIN_USERNAME", "admin"),
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
		JwtSecret:     os.Getenv("JWT_SECRET"),
	}

	if Cfg.AdminPassword == "" {
		log.Printf("[cfg] ADMIN_PASSWORD is not set — login will always fail until it is")
	}
	if Cfg.CloudToken == "" {
		log.Printf("[cfg] HCLOUD_TOKEN is not set — Hetzner requests will fail until it is")
	}
	if Cfg.Proxy != "" {
		log.Printf("[cfg] outgoing Hetzner requests go through the proxy %s", RedactProxy(Cfg.Proxy))
	}
}

func firstEnv(keys ...string) string {
	for _, k := range keys {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return ""
}

// RedactProxy hides the password of a proxy URL for logs:
// http://user:secret@host:1 -> http://user:***@host:1
func RedactProxy(raw string) string {
	at := strings.LastIndex(raw, "@")
	if at == -1 {
		return raw
	}
	creds := raw[:at]
	if i := strings.Index(creds, "://"); i != -1 {
		creds = creds[i+3:]
	}
	user, _, hasPass := strings.Cut(creds, ":")
	prefix := raw[:strings.Index(raw, creds)]
	if hasPass {
		return prefix + user + ":***" + raw[at:]
	}
	return prefix + user + raw[at:]
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	v, err := strconv.Atoi(os.Getenv(key))
	if err != nil || v < 1 || v > 65535 {
		return def
	}
	return v
}

// loadDotEnv reads KEY=VALUE lines from path if it exists. Existing
// environment variables always win. Missing file is fine.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key, value = strings.TrimSpace(key), strings.TrimSpace(value)
		value = strings.Trim(value, `"'`)
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
}
