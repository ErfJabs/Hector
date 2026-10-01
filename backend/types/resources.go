package types

import "time"

// ---- volumes -----------------------------------------------------------

type Volume struct {
	ID            int64             `json:"id"`
	Name          string            `json:"name"`
	SizeGB        int               `json:"sizeGb"`
	Status        string            `json:"status"`
	Location      LocationInfo      `json:"location"`
	ServerID      *int64            `json:"serverId"`
	Device        string            `json:"device"`
	Format        string            `json:"format"`
	Labels        map[string]string `json:"labels"`
	ProtectDelete bool              `json:"protectDelete"`
	Created       time.Time         `json:"created"`
}

type VolumeCreateRequest struct {
	Name      string            `json:"name"`
	SizeGB    int               `json:"sizeGb"`
	Location  string            `json:"location"`
	ServerID  *int64            `json:"serverId"`
	Format    string            `json:"format"`
	Automount bool              `json:"automount"`
	Labels    map[string]string `json:"labels"`
}

type VolumeAttachRequest struct {
	ServerID  int64 `json:"serverId"`
	Automount bool  `json:"automount"`
}

type VolumeResizeRequest struct {
	SizeGB int `json:"sizeGb"`
}

// ---- networks ----------------------------------------------------------

type NetworkSubnet struct {
	Type        string `json:"type"`
	IPRange     string `json:"ipRange"`
	NetworkZone string `json:"networkZone"`
	Gateway     string `json:"gateway"`
}

type NetworkRoute struct {
	Destination string `json:"destination"`
	Gateway     string `json:"gateway"`
}

type Network struct {
	ID            int64             `json:"id"`
	Name          string            `json:"name"`
	IPRange       string            `json:"ipRange"`
	Subnets       []NetworkSubnet   `json:"subnets"`
	Routes        []NetworkRoute    `json:"routes"`
	Servers       []int64           `json:"servers"`
	LoadBalancers []int64           `json:"loadBalancers"`
	Labels        map[string]string `json:"labels"`
	ExposeSwitch  bool              `json:"exposeSwitch"`
	ProtectDelete bool              `json:"protectDelete"`
	Created       time.Time         `json:"created"`
}

type NetworkMember struct {
	Type     string   `json:"type"` // server | load_balancer
	ID       int64    `json:"id"`
	IP       string   `json:"ip"`
	Status   string   `json:"status"`
	AliasIPs []string `json:"aliasIps"`
	Subnet   string   `json:"subnet"`
}

type NetworkCreateRequest struct {
	Name          string            `json:"name"`
	IPRange       string            `json:"ipRange"`
	Location      string            `json:"location"` // network zone hint: eu-central
	SubnetIPRange string            `json:"subnetIpRange"`
	SubnetZone    string            `json:"subnetZone"`
	Labels        map[string]string `json:"labels"`
}

type NetworkUpdateRequest struct {
	Name   string            `json:"name"`
	Labels map[string]string `json:"labels"`
}

type NetworkSubnetRequest struct {
	IPRange     string `json:"ipRange"`
	NetworkZone string `json:"networkZone"`
	Type        string `json:"type"`
}

type NetworkRouteRequest struct {
	Destination string `json:"destination"`
	Gateway     string `json:"gateway"`
}

// ---- firewalls ---------------------------------------------------------

type FirewallRule struct {
	Direction    string   `json:"direction"` // in | out
	Protocol     string   `json:"protocol"`
	Port         string   `json:"port"`
	Sources      []string `json:"sources"`
	Destinations []string `json:"destinations"`
	Description  string   `json:"description"`
}

type FirewallTarget struct {
	Type     string `json:"type"` // server | label_selector
	ServerID int64  `json:"serverId"`
	Selector string `json:"selector"`
}

type Firewall struct {
	ID        int64             `json:"id"`
	Name      string            `json:"name"`
	Rules     []FirewallRule    `json:"rules"`
	AppliedTo []FirewallTarget  `json:"appliedTo"`
	Labels    map[string]string `json:"labels"`
	Created   time.Time         `json:"created"`
}

type FirewallCreateRequest struct {
	Name           string            `json:"name"`
	Rules          []FirewallRule    `json:"rules"`
	ApplyServerIDs []int64           `json:"applyServerIds"`
	Labels         map[string]string `json:"labels"`
}

type FirewallRulesRequest struct {
	Rules []FirewallRule `json:"rules"`
}

type FirewallApplyRequest struct {
	ServerIDs []int64 `json:"serverIds"`
	Selector  string  `json:"selector"`
}

// ---- floating and primary IPs -----------------------------------------

type IPDNSEntry struct {
	IP     string `json:"ip"`
	DNSPtr string `json:"dnsPtr"`
}

type FloatingIP struct {
	ID            int64             `json:"id"`
	Name          string            `json:"name"`
	IP            string            `json:"ip"`
	Type          string            `json:"type"` // ipv4 | ipv6
	ServerID      *int64            `json:"serverId"`
	Description   string            `json:"description"`
	HomeLocation  LocationInfo      `json:"location"`
	DNS           []IPDNSEntry      `json:"dns"`
	Blocked       bool              `json:"blocked"`
	ProtectDelete bool              `json:"protectDelete"`
	Labels        map[string]string `json:"labels"`
	Created       time.Time         `json:"created"`
}

type FloatingIPCreateRequest struct {
	Name        string            `json:"name"`
	Type        string            `json:"type"`
	Location    string            `json:"location"`
	ServerID    *int64            `json:"serverId"`
	Description string            `json:"description"`
	Labels      map[string]string `json:"labels"`
}

type PrimaryIP struct {
	ID            int64             `json:"id"`
	Name          string            `json:"name"`
	IP            string            `json:"ip"`
	Type          string            `json:"type"`
	AssigneeID    *int64            `json:"assigneeId"`
	AssigneeType  string            `json:"assigneeType"`
	AutoDelete    bool              `json:"autoDelete"`
	Location      LocationInfo      `json:"location"`
	DNS           []IPDNSEntry      `json:"dns"`
	Blocked       bool              `json:"blocked"`
	ProtectDelete bool              `json:"protectDelete"`
	Labels        map[string]string `json:"labels"`
	Created       time.Time         `json:"created"`
}

type PrimaryIPCreateRequest struct {
	Name         string            `json:"name"`
	Type         string            `json:"type"`
	Location     string            `json:"location"`
	AutoDelete   bool              `json:"autoDelete"`
	AssigneeID   *int64            `json:"assigneeId"`
	AssigneeType string            `json:"assigneeType"`
	Labels       map[string]string `json:"labels"`
}

type AssignRequest struct {
	AssigneeID int64 `json:"assigneeId"`
}

type AssignServerRequest struct {
	ServerID int64 `json:"serverId"`
}

type ChangeDNSRequest struct {
	IP     string `json:"ip"`
	DNSPtr string `json:"dnsPtr"`
}

type ProtectRequest struct {
	Protect bool `json:"protect"`
}

type LabelsRequest struct {
	Labels map[string]string `json:"labels"`
}

// ---- load balancers ----------------------------------------------------

type LBService struct {
	Protocol        string  `json:"protocol"`
	ListenPort      int     `json:"listenPort"`
	DestinationPort int     `json:"destinationPort"`
	ProxyProtocol   bool    `json:"proxyProtocol"`
	Certificates    []int64 `json:"certificates"`
	RedirectHTTP    bool    `json:"redirectHttp"`
	StickySessions  bool    `json:"stickySessions"`
}

type LBTarget struct {
	Type         string     `json:"type"` // server | label_selector | ip
	ServerID     int64      `json:"serverId"`
	Selector     string     `json:"selector"`
	IP           string     `json:"ip"`
	UsePrivateIP bool       `json:"usePrivateIP"`
	HealthStatus []LBHealth `json:"healthStatus"`
}

type LBHealth struct {
	ListenPort int    `json:"listenPort"`
	Status     string `json:"status"`
}

type LoadBalancer struct {
	ID            int64             `json:"id"`
	Name          string            `json:"name"`
	Type          string            `json:"type"`
	Location      LocationInfo      `json:"location"`
	Algorithm     string            `json:"algorithm"`
	IPv4          string            `json:"ipv4"`
	IPv6          string            `json:"ipv6"`
	PublicEnabled bool              `json:"publicEnabled"`
	Services      []LBService       `json:"services"`
	Targets       []LBTarget        `json:"targets"`
	Labels        map[string]string `json:"labels"`
	ProtectDelete bool              `json:"protectDelete"`
	Created       time.Time         `json:"created"`
	Actions       []ActionInfo      `json:"actions"`
	ActionsTotal  int               `json:"actionsTotal"`
}

type LoadBalancerCreateRequest struct {
	Name      string            `json:"name"`
	Type      string            `json:"type"`
	Location  string            `json:"location"`
	Algorithm string            `json:"algorithm"`
	Labels    map[string]string `json:"labels"`
}

type LBTargetRequest struct {
	Type         string `json:"type"` // server | label_selector | ip
	ServerID     int64  `json:"serverId"`
	Selector     string `json:"selector"`
	IP           string `json:"ip"`
	UsePrivateIP bool   `json:"usePrivateIp"`
}

type LBServiceRequest struct {
	Protocol        string  `json:"protocol"`
	ListenPort      int     `json:"listenPort"`
	DestinationPort int     `json:"destinationPort"`
	CertificateIDs  []int64 `json:"certificateIds"`
	RedirectHTTP    bool    `json:"redirectHttp"`
	StickySessions  bool    `json:"stickySessions"`
}

// ---- placement groups --------------------------------------------------

type PlacementGroup struct {
	ID        int64             `json:"id"`
	Name      string            `json:"name"`
	Type      string            `json:"type"` // spread | fanout
	ServerIDs []int64           `json:"serverIds"`
	Labels    map[string]string `json:"labels"`
	Created   time.Time         `json:"created"`
}

type PlacementGroupCreateRequest struct {
	Name   string            `json:"name"`
	Type   string            `json:"type"`
	Labels map[string]string `json:"labels"`
}

// ---- certificates ------------------------------------------------------

type CertificateUsedBy struct {
	ID   int64  `json:"id"`
	Type string `json:"type"`
}

type Certificate struct {
	ID             int64               `json:"id"`
	Name           string              `json:"name"`
	Type           string              `json:"type"`
	DomainNames    []string            `json:"domainNames"`
	Fingerprint    string              `json:"fingerprint"`
	NotValidBefore time.Time           `json:"notValidBefore"`
	NotValidAfter  time.Time           `json:"notValidAfter"`
	Issuance       string              `json:"issuance"`
	Renewal        string              `json:"renewal"`
	IssuanceError  string              `json:"issuanceError"`
	UsedBy         []CertificateUsedBy `json:"usedBy"`
	Labels         map[string]string   `json:"labels"`
	Created        time.Time           `json:"created"`
}

type CertificateCreateRequest struct {
	Name        string            `json:"name"`
	Type        string            `json:"type"` // managed | uploaded
	DomainNames []string          `json:"domainNames"`
	Certificate string            `json:"certificate"`
	PrivateKey  string            `json:"privateKey"`
	Labels      map[string]string `json:"labels"`
}

// ---- SSH keys ----------------------------------------------------------

type SSHKey struct {
	ID          int64             `json:"id"`
	Name        string            `json:"name"`
	Fingerprint string            `json:"fingerprint"`
	PublicKey   string            `json:"publicKey"`
	Labels      map[string]string `json:"labels"`
	Created     time.Time         `json:"created"`
}

type SSHKeyCreateRequest struct {
	Name      string            `json:"name"`
	PublicKey string            `json:"publicKey"`
	Labels    map[string]string `json:"labels"`
}

// ---- images ------------------------------------------------------------

type Image struct {
	ID            int64             `json:"id"`
	Name          string            `json:"name"`
	Description   string            `json:"description"`
	Type          string            `json:"type"`
	Status        string            `json:"status"`
	OSFlavor      string            `json:"osFlavor"`
	OSVersion     string            `json:"osVersion"`
	Arch          string            `json:"arch"`
	SizeGB        int               `json:"sizeGb"`
	DiskGB        int               `json:"diskGb"`
	BoundTo       *int64            `json:"boundTo"`
	RapidDeploy   bool              `json:"rapidDeploy"`
	Labels        map[string]string `json:"labels"`
	ProtectDelete bool              `json:"protectDelete"`
	Deprecated    *time.Time        `json:"deprecated"`
	Created       *time.Time        `json:"created"`
}

// ImageUpdateRequest rewrites what Hetzner stores in `description` — the
// field the console renders as a snapshot's name — plus the labels. Images
// have no rename endpoint.
type ImageUpdateRequest struct {
	Description string            `json:"description"`
	Labels      map[string]string `json:"labels"`
}

// ---- activity ----------------------------------------------------------

// Activity is the project-wide action feed: what is running right now and
// what just finished, across every resource kind.
type Activity struct {
	Actions []ActionInfo `json:"actions"`
	Running []ActionInfo `json:"running"`
	Total   int          `json:"total"`
}
