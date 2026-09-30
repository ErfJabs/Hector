// Package types holds the JSON contract served to the frontend. Everything
// here is presentation-shaped: the frontend renders these fields directly.
package types

import "time"

// ---- fleet -------------------------------------------------------------

type Fleet struct {
	Servers   []FleetItem  `json:"servers"`
	Summary   FleetSummary `json:"summary"`
	Currency  string       `json:"currency"`
	FetchedAt time.Time    `json:"fetchedAt"`
}

type FleetSummary struct {
	Total    int     `json:"total"`
	Running  int     `json:"running"`
	VCPU     int     `json:"vcpu"`
	MemoryGB float64 `json:"memoryGb"`
	DiskGB   int     `json:"diskGb"`
	OutBytes uint64  `json:"outBytes"`
	Monthly  float64 `json:"monthly"` // sum of known prices (legacy ones at their old price)
	Legacy   int     `json:"legacy"`  // servers whose price is unknown (not in Monthly)
}

type FleetItem struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"` // running, starting, off, unknown, ...
	Busy   *Busy  `json:"busy"`

	Type     TypeInfo     `json:"type"`
	Location LocationInfo `json:"location"`
	Image    string       `json:"image"`
	IPv4     string       `json:"ipv4"`
	IPv6     string       `json:"ipv6"`

	CPU     *CPUInfo    `json:"cpu"` // nil when off / metrics unavailable
	Traffic TrafficInfo `json:"traffic"`
	Price   float64     `json:"price"` // monthly, incl. the account's VAT (as the Hetzner console shows)

	Locked         bool `json:"locked"`
	Rescue         bool `json:"rescue"`
	ISO            bool `json:"iso"`
	Backups        bool `json:"backups"`
	ProtectDelete  bool `json:"protectDelete"`
	ProtectRebuild bool `json:"protectRebuild"`
	IPBlocked      bool `json:"ipBlocked"` // public_net.ipv4/ipv6.blocked (abuse block)

	Created time.Time `json:"created"`
	// LegacyPrice: ordered before Hetzner's 2026-06-15 price change, so it is
	// billed at its old price. The API doesn't expose that price; Price then
	// comes from the legacyPrices table, or PriceUnknown is set.
	LegacyPrice  bool `json:"legacyPrice"`
	PriceUnknown bool `json:"priceUnknown"`
}

type Busy struct {
	Command  string `json:"command"`
	Progress int    `json:"progress"`
}

type TypeInfo struct {
	Name       string  `json:"name"`
	Cores      int     `json:"cores"`
	MemoryGB   float64 `json:"memoryGb"`
	DiskGB     int     `json:"diskGb"`
	CPUType    string  `json:"cpuType"` // shared | dedicated
	Arch       string  `json:"arch"`    // x86 | arm
	Storage    string  `json:"storage"` // local | network
	Category   string  `json:"category"`
	Deprecated bool    `json:"deprecated"`
}

type LocationInfo struct {
	Code    string `json:"code"` // FSN1
	City    string `json:"city"`
	Country string `json:"country"`
	Zone    string `json:"zone"`
}

type CPUInfo struct {
	Now    float64   `json:"now"`
	Series []float64 `json:"series"` // ~12 points over the last hour
}

type TrafficInfo struct {
	OutBytes      uint64 `json:"outBytes"`
	InBytes       uint64 `json:"inBytes"`
	IncludedBytes uint64 `json:"includedBytes"`
}

// ---- server detail -----------------------------------------------------

type ServerDetail struct {
	FleetItem
	Datacenter   string       `json:"datacenter"` // FSN1-DC14
	OnSince      *time.Time   `json:"onSince"`    // last poweron/reboot/reset/create
	RDNS         []RDNSRow    `json:"rdns"`
	Actions      []ActionInfo `json:"actions"`
	ActionsTotal int          `json:"actionsTotal"`
}

// MetricsExtras hosts the parts of a server detail that the fleet list does
// not carry. They ride on the metrics view so the panel opens a server with
// ONE request — the list already has the base item.
type MetricsExtras struct {
	Item         FleetItem    `json:"item"`
	RDNS         []RDNSRow    `json:"rdns"`
	Actions      []ActionInfo `json:"actions"`
	ActionsTotal int          `json:"actionsTotal"`
	OnSince      *time.Time   `json:"onSince"`
}

type RDNSRow struct {
	Family string `json:"family"` // IPv4 | IPv6
	IP     string `json:"ip"`
	DNSPtr string `json:"dnsPtr"`
}

// ---- actions -----------------------------------------------------------

type ActionInfo struct {
	ID           int64      `json:"id"`
	Command      string     `json:"command"`
	Status       string     `json:"status"` // running | success | error
	Progress     int        `json:"progress"`
	Started      time.Time  `json:"started"`
	Finished     *time.Time `json:"finished"`
	DurationS    int        `json:"durationS"`
	ErrorCode    string     `json:"errorCode"`
	ErrorMessage string     `json:"errorMessage"`
}

// ---- metrics -----------------------------------------------------------

type MetricsView struct {
	Range string      `json:"range"`
	Step  int         `json:"step"` // seconds per point
	CPU   CPUMetrics  `json:"cpu"`
	Disk  DiskMetrics `json:"disk"`
	Net   NetMetrics  `json:"net"`
	// Extras: rDNS, recent actions, on-since and a fresh base item — nil
	// when the server fetch failed (the charts still render).
	Extras *MetricsExtras `json:"extras,omitempty"`
}

type CPUMetrics struct {
	Now    float64   `json:"now"`
	Avg    float64   `json:"avg"`
	Peak   float64   `json:"peak"`
	Series []float64 `json:"series"` // percent, 0..100
}

type DiskMetrics struct {
	Read      []float64 `json:"read"`  // MB/s
	Write     []float64 `json:"write"` // MB/s
	IOPSRead  float64   `json:"iopsRead"`
	IOPSWrite float64   `json:"iopsWrite"`
}

type NetMetrics struct {
	In     []float64 `json:"in"`  // Mbit/s
	Out    []float64 `json:"out"` // Mbit/s
	PPSIn  float64   `json:"ppsIn"`
	PPSOut float64   `json:"ppsOut"`
}

// ---- catalog -----------------------------------------------------------

type Catalog struct {
	Currency      string              `json:"currency"`
	VatRate       string              `json:"vatRate"`
	BackupPercent string              `json:"backupPercent"`
	Locations     []CatalogLocation   `json:"locations"`
	Images        []CatalogImage      `json:"images"`
	ServerTypes   []CatalogServerType `json:"serverTypes"`
	SSHKeys       []CatalogSSHKey     `json:"sshKeys"`
	ISOs          []CatalogISO        `json:"isos"`
}

type CatalogISO struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Type        string `json:"type"`
	Arch        string `json:"arch"`
}

type CatalogLocation struct {
	Code    string `json:"code"` // FSN1
	Name    string `json:"name"` // fsn1
	City    string `json:"city"`
	Country string `json:"country"`
	Zone    string `json:"zone"`
}

type CatalogImage struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Type        string `json:"type"`
	OSFlavor    string `json:"osFlavor"`
	OSVersion   string `json:"osVersion"`
	Arch        string `json:"arch"`
}

type CatalogServerType struct {
	ID         int64                `json:"id"`
	Name       string               `json:"name"`
	Cores      int                  `json:"cores"`
	MemoryGB   float64              `json:"memoryGb"`
	DiskGB     int                  `json:"diskGb"`
	Storage    string               `json:"storage"`
	CPUType    string               `json:"cpuType"`
	Arch       string               `json:"arch"`
	Category   string               `json:"category"`
	Deprecated bool                 `json:"deprecated"`
	Prices     map[string]TypePrice `json:"prices"` // key: location code
}

type TypePrice struct {
	Monthly    float64 `json:"monthly"` // net, EUR
	Hourly     float64 `json:"hourly"`  // net, EUR
	IncludedGB uint64  `json:"includedGb"`
	Available  bool    `json:"available"`
}

type CatalogSSHKey struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Fingerprint string `json:"fingerprint"`
}

// ---- create ------------------------------------------------------------

type CreateRequest struct {
	Name             string  `json:"name"`
	ServerType       string  `json:"type"`
	Image            string  `json:"image"`
	Location         string  `json:"location"`
	SSHKeys          []int64 `json:"sshKeys"`
	UserData         string  `json:"userData"`
	StartAfterCreate bool    `json:"startAfterCreate"`
	Backups          bool    `json:"backups"`
	EnableIPv4       bool    `json:"enableIpv4"`
	EnableIPv6       bool    `json:"enableIpv6"`
}

type CreateResult struct {
	Server       FleetItem    `json:"server"`
	Action       ActionInfo   `json:"action"`
	NextActions  []ActionInfo `json:"nextActions"`
	RootPassword string       `json:"rootPassword"`
}

// ---- jobs (multi-step orchestration, in memory) ------------------------

type Job struct {
	ID       string    `json:"id"`
	ServerID int64     `json:"serverId"`
	Kind     string    `json:"kind"`   // rescale
	Status   string    `json:"status"` // running | success | error
	Steps    []JobStep `json:"steps"`
	Error    string    `json:"error"`
}

type JobStep struct {
	Key      string `json:"key"`
	Status   string `json:"status"` // pending | running | success | error | skipped
	Progress int    `json:"progress"`
	Error    string `json:"error"`
}

// ---- misc ---------------------------------------------------------------

type SnapshotsInfo struct {
	Count  int `json:"count"`
	SizeGB int `json:"sizeGb"`
}
