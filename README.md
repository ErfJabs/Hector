https://github.com/user-attachments/assets/5b54b18a-e1ad-436f-83ea-656eb4f524be

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
- grouped resource sections with full CRUD and actions:
  - **compute** — volumes (attach / detach / resize), images (rename, protect)
  - **network** — private networks (subnets, routes), firewalls (rules,
    apply / unapply), load balancers (targets, algorithm, public interface)
  - **addresses** — floating and primary IPs (assign, reverse DNS, protection)
  - **platform** — SSH keys, certificates, placement groups
  - **system** — a project-wide activity feed of every running / finished action
- rate-limit aware Hetzner client (429 + `Retry-After`, quota readout)
- pricing / catalog helpers for picking a server
- single admin login (JWT session), dark "Red Grid" UI, mobile + desktop

## Requirements

- Go 1.26+
- Node 20.19+ or 22.12+ (only to build the frontend)

## Install & use

The panel is installed and managed with the `hector` helper script. Run the
commands below on your Linux server as **root** (or with `sudo`). Binaries
come from GitHub releases, so nothing has to be built on the server. The
examples use the name `mypanel` — pick any name you like.

<details>
<summary><b>1 · Install the script</b> — one time per server</summary>

```sh
sudo bash -c "$(curl -sL https://raw.githubusercontent.com/ErfJabs/Hector/master/install.sh)" @ script-install
```

Downloads the `hector` command to `/usr/local/bin`. From then on you can type
`hector …` anywhere. Run the same command again anytime to update the script.
</details>

<details>
<summary><b>2 · Install the panel</b> — create an instance</summary>

```sh
hector install mypanel master
```

This will:

1. create `/opt/erfjab/hector/mypanel`,
2. download the newest build for your server's CPU,
3. create a fresh `.env` and open it in **nano** — put your `HCLOUD_TOKEN`
   in it (create one in the Hetzner console → Security → API tokens, with
   read + write) and an `ADMIN_PASSWORD`, then save with `Ctrl+O`, `Enter`
   and close with `Ctrl+X`,
4. create a systemd service, start the panel and show the live log.

Repeat with another name (`hector install panel-b master`) to run more
instances on the same server — give each one its own `API_PORT` in its `.env`.
</details>

<details>
<summary><b>Start it</b></summary>

```sh
hector start mypanel
```
</details>

<details>
<summary><b>Stop it</b></summary>

```sh
hector stop mypanel
```
</details>

<details>
<summary><b>Restart it</b></summary>

```sh
hector restart mypanel
```
</details>

<details>
<summary><b>Is it running?</b></summary>

```sh
hector status mypanel
```
</details>

<details>
<summary><b>Read the logs</b></summary>

```sh
hector logs mypanel
```

Shows the last 20 lines and keeps following them. For more history first:
`hector logs mypanel 200`.
</details>

<details>
<summary><b>Update it</b> — newest build of the branch</summary>

```sh
hector update mypanel master
```

Downloads the newest binary of that branch and swaps it in — your `.env` and
settings stay as they are, and the service restarts on its own.
</details>

<details>
<summary><b>Update everything</b> — all instances at once</summary>

```sh
hector update-all master
```
</details>

<details>
<summary><b>List all instances</b></summary>

```sh
hector list
```
</details>

<details>
<summary><b>Find an instance folder</b></summary>

```sh
hector dir mypanel
```
</details>

<details>
<summary><b>Edit an instance .env</b></summary>

```sh
hector env mypanel
```

Opens the file in nano and asks if you want to restart the panel so the
changes apply.
</details>

<details>
<summary><b>Delete an instance</b> — permanently</summary>

```sh
hector remove mypanel
```

Stops and disables the service and deletes `/opt/erfjab/hector/mypanel`
including its `.env`. This cannot be undone.
</details>

<details>
<summary><b>Uninstall the script itself</b></summary>

```sh
hector script-remove
```

Removes the `hector` command. Instances are untouched — delete them with
`hector remove <name>` first.
</details>

<details>
<summary><b>All commands at a glance</b></summary>

```sh
hector help
```
</details>

## Development

```sh
make frontend      # React -> frontend/dist (must exist before any go build)
make vet           # go vet ./...
make test          # go test ./...
make dev           # build the frontend once, then go run .
make frontend-dev  # Vite on :5173, /api proxied to :8787
```

The route table in `backend/transport/api/routes/routes.go` is the
authoritative API surface and `routes_test.go` pins it — a new endpoint
without a test fails the suite. Layering is strict: `backend/hetzner`
(client) → `backend/services` (cache + business rules) → `handlers` →
`routes` → React. There is no database.

## Community

Telegram channel: [@erfjabs](https://t.me/erfjabs)

