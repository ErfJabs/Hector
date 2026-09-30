# Hector

A single-admin web panel for the **Hetzner Cloud API**. One Go binary
(Fiber v2) serves both the API and an embedded React app — there is no
database; everything comes live from `api.hetzner.cloud`, optionally through
a SOCKS5 or HTTP proxy.

## Features

- fleet list + server detail (status, IPs, specs, traffic)
- power actions, rebuild, rescue, ISO / snapshot management
- rescale with background jobs and progress
- metrics charts (CPU, disk, network)
- networks, firewalls and SSH keys
- pricing / catalog helpers for picking a server
- single admin login (JWT session), dark "Red Grid" UI, mobile + desktop

## Requirements

- Go 1.26+
- Node 20.19+ or 22.12+ (only to build the frontend)

## Setup

```sh
git clone https://github.com/ErfJabs/Hector.git && cd Hector
cp .env.example .env   # then set HCLOUD_TOKEN and ADMIN_PASSWORD
```

Key environment variables (see `.env.example` for all of them):

| Variable | Purpose |
| --- | --- |
| `HCLOUD_TOKEN` | Hetzner Cloud API token (read + write) |
| `PROXY_URL` | optional SOCKS5/HTTP proxy for all Hetzner calls |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | the single admin account |
| `JWT_SECRET` | session signing secret (random when empty) |
| `API_HOST`, `API_PORT` | bind address (default `0.0.0.0:8787`) |

## Build and run

```sh
make build
./app.exe
```

Or without make:

```sh
cd frontend && npm install && npm run build
cd .. && go build -o app.exe . && ./app.exe
```

Dev loop: run the Go server (`go run .`) and the Vite dev server
(`make frontend-dev`) which proxies `/api` to `127.0.0.1:8787`.

## Install on a server

Every branch push is built by GitHub Actions and published as a
`<branch>-latest` release with Linux binaries for amd64, arm64, armv7 and
armv6 — no build tools needed on the server.

```sh
curl -sSL https://raw.githubusercontent.com/ErfJabs/Hector/master/install.sh | bash -s script-install
hector install mypanel master   # name + branch
hector update mypanel master
hector list
hector help                   # all commands
```

## Community

Telegram channel: [@erfjabs](https://t.me/erfjabs)

