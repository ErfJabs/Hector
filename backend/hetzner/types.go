// Package hetzner is a small hand-written client for the Hetzner Cloud API
// (https://api.hetzner.cloud/v1). It owns authentication, pagination, the
// request/response wire shapes and error decoding — nothing else. Business
// decisions live in backend/services.
package hetzner

import "time"

// ---- servers -----------------------------------------------------------

type Server struct {
	ID         int64      `json:"id"`
	Name       string     `json:"name"`
	Status     string     `json:"status"`
	Created    time.Time  `json:"created"`
	PublicNet  PublicNet  `json:"public_net"`
	PrivateNet []any      `json:"private_net"`
	ServerType ServerType `json:"server_type"`
	// Location replaced datacenter on the server object; the nested
	// datacenter is a legacy fallback newer API responses no longer include.
	Location        Location    `json:"location"`
	Datacenter      *Datacenter `json:"datacenter"`
	IncludedTraffic uint64      `json:"included_traffic"`
	OutgoingTraffic *uint64     `json:"outgoing_traffic"`
	IngoingTraffic  *uint64     `json:"ingoing_traffic"`
	BackupWindow    *string     `json:"backup_window"`
	RescueEnabled   bool        `json:"rescue_enabled"`
	ISO             *ISO        `json:"iso"`
	Locked          bool        `json:"locked"`
	Image           *Image      `json:"image"`
	Protection      Protection  `json:"protection"`
	Labels          map[string]string
	PrimaryDiskSize int `json:"primary_disk_size"`
}

type PublicNet struct {
	IPv4 *PublicNetIP `json:"ipv4"`
	IPv6 *PublicNetV6 `json:"ipv6"`
}

type PublicNetIP struct {
	IP      string  `json:"ip"`
	Blocked bool    `json:"blocked"`
	DNSPtr  *string `json:"dns_ptr"`
}

type PublicNetV6 struct {
	IP      string   `json:"ip"`
	Blocked bool     `json:"blocked"`
	DNSPtr  []DNSPtr `json:"dns_ptr"`
}

type DNSPtr struct {
	IP     string `json:"ip"`
	DNSPtr string `json:"dns_ptr"`
}

type Protection struct {
	Delete  bool `json:"delete"`
	Rebuild bool `json:"rebuild"`
}

type ISO struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Type         string `json:"type"`
	Architecture string `json:"architecture"`
}

// ---- server types ------------------------------------------------------

type ServerType struct {
	ID              int64             `json:"id"`
	Name            string            `json:"name"`
	Description     string            `json:"description"`
	Category        string            `json:"category"`
	Cores           int               `json:"cores"`
	Memory          float64           `json:"memory"`
	Disk            int               `json:"disk"`
	StorageType     string            `json:"storage_type"`
	CPUType         string            `json:"cpu_type"`
	Architecture    string            `json:"architecture"`
	IncludedTraffic int64             `json:"included_traffic"`
	Deprecated      bool              `json:"deprecated"`
	Prices          []ServerTypePrice `json:"prices"`
	Locations       []ServerTypeLoc   `json:"locations"`
}

type ServerTypePrice struct {
	Location          string `json:"location"`
	PriceHourly       Price  `json:"price_hourly"`
	PriceMonthly      Price  `json:"price_monthly"`
	IncludedTraffic   uint64 `json:"included_traffic"`
	PricePerTBTraffic Price  `json:"price_per_tb_traffic"`
}

type ServerTypeLoc struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Deprecated  bool   `json:"deprecated"`
	Recommended bool   `json:"recommended"`
	Available   bool   `json:"available"`
}

type Price struct {
	Net   string `json:"net"`
	Gross string `json:"gross"`
}

// ---- datacenter / location --------------------------------------------

type Datacenter struct {
	ID          int64            `json:"id"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Location    Location         `json:"location"`
	ServerTypes *DatacenterTypes `json:"server_types,omitempty"`
}

type DatacenterTypes struct {
	Supported             []int64 `json:"supported"`
	AvailableForMigration []int64 `json:"available_for_migration"`
	Available             []int64 `json:"available"`
}

type Location struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	City        string  `json:"city"`
	Country     string  `json:"country"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	NetworkZone string  `json:"network_zone"`
}

// ---- image / ssh key ---------------------------------------------------

type Image struct {
	ID           int64      `json:"id"`
	Name         string     `json:"name"`
	Description  string     `json:"description"`
	Type         string     `json:"type"`
	Status       string     `json:"status"`
	OSFlavor     string     `json:"os_flavor"`
	OSVersion    string     `json:"os_version"`
	Architecture string     `json:"architecture"`
	BoundTo      *int64     `json:"bound_to"`
	ImageSize    *float32   `json:"image_size"`
	DiskSize     float32    `json:"disk_size"`
	Deprecated   *time.Time `json:"deprecated"`
}

type SSHKey struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Fingerprint string `json:"fingerprint"`
	PublicKey   string `json:"public_key"`
}

// ---- actions -----------------------------------------------------------

type Action struct {
	ID        int64            `json:"id"`
	Status    string           `json:"status"` // running | success | error
	Command   string           `json:"command"`
	Progress  int              `json:"progress"`
	Started   time.Time        `json:"started"`
	Finished  *time.Time       `json:"finished"`
	Error     *ActionError     `json:"error"`
	Resources []ActionResource `json:"resources"`
}

type ActionResource struct {
	ID   int64  `json:"id"`
	Type string `json:"type"`
}

type ActionError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ---- metrics -----------------------------------------------------------

// Metrics is the modern (time_series) metrics response. Series names follow
// Hetzner's scheme: "cpu", "disk.0.bandwidth.read", "disk.0.iops.write",
// "network.0.bandwidth.in", "network.0.pps.out", ...
type Metrics struct {
	Start      time.Time                 `json:"start"`
	End        time.Time                 `json:"end"`
	Step       float64                   `json:"step"`
	TimeSeries map[string]TimeSeriesVals `json:"time_series"`
}

type TimeSeriesVals struct {
	Values [][2]any `json:"values"` // [timestamp, "value"]
}

// ---- pricing -----------------------------------------------------------

type Pricing struct {
	Currency     string              `json:"currency"`
	VATRate      string              `json:"vat_rate"`
	ServerBackup PricingServerBackup `json:"server_backup"`
	ServerTypes  []PricingServerType `json:"server_types"`
}

type PricingServerBackup struct {
	Percentage string `json:"percentage"`
}

type PricingServerType struct {
	ID     int64                    `json:"id"`
	Name   string                   `json:"name"`
	Prices []PricingServerTypePrice `json:"prices"`
}

type PricingServerTypePrice struct {
	Location          string `json:"location"`
	PriceHourly       Price  `json:"price_hourly"`
	PriceMonthly      Price  `json:"price_monthly"`
	IncludedTraffic   uint64 `json:"included_traffic"`
	PricePerTBTraffic Price  `json:"price_per_tb_traffic"`
}

// ---- responses ---------------------------------------------------------

type ServerCreateResponse struct {
	Server       Server   `json:"server"`
	Action       Action   `json:"action"`
	RootPassword *string  `json:"root_password"`
	NextActions  []Action `json:"next_actions"`
}

type ServerCreateRequest struct {
	Name             string                 `json:"name"`
	ServerType       string                 `json:"server_type"`
	Image            string                 `json:"image"`
	Location         string                 `json:"location,omitempty"`
	SSHKeys          []int64                `json:"ssh_keys,omitempty"`
	UserData         string                 `json:"user_data,omitempty"`
	StartAfterCreate *bool                  `json:"start_after_create,omitempty"`
	Backups          *bool                  `json:"backups,omitempty"`
	PublicNet        *ServerCreatePublicNet `json:"public_net,omitempty"`
}

type ServerCreatePublicNet struct {
	EnableIPv4 bool `json:"enable_ipv4"`
	EnableIPv6 bool `json:"enable_ipv6"`
}
