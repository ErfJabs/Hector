package services

import (
	"context"
	"log"
	"math"
	"sync"
	"time"

	"hector/backend/hetzner"
	"hector/backend/types"
)

// priceChange2026: Hetzner's price adjustment (15 Jun 2026, 08:00 CEST).
// Servers ordered earlier keep their old price; /pricing only has the new
// one. ponytail: a legacy server rescaled after this date moves to the new
// price — the Created check can't see that; it errs on "legacy".
var priceChange2026 = time.Date(2026, 6, 15, 6, 0, 0, 0, time.UTC)

// fleetTTL keeps hot page loads cheap; the UI exposes an explicit refresh
// that bypasses it.
const fleetTTL = 25 * time.Second

var fleetCache = newTTLCache[*types.Fleet]()

// Fleet assembles the servers list with the data every card needs: specs,
// location, image, price, traffic, current CPU series and the in-flight
// action (Hetzner locks a server while an action runs; the list shows it).
func Fleet(ctx context.Context, fresh bool) (*types.Fleet, error) {
	if !fresh {
		if v, ok := fleetCache.get("fleet"); ok {
			return v, nil
		}
	}

	servers, err := hcloud.Servers(ctx)
	if err != nil {
		return nil, err
	}

	idx, _ := prices(ctx) // prices are optional: a pricing failure must not kill the list

	running := map[int64]hetzner.Action{}
	if actions, err := hcloud.RunningActions(ctx); err == nil {
		for _, a := range actions {
			for _, res := range a.Resources {
				if res.Type == "server" {
					running[res.ID] = a
				}
			}
		}
	}

	cpu := cpuForServers(ctx, servers)

	fleet := &types.Fleet{
		Currency:  currencyOr(idx, "EUR"),
		FetchedAt: time.Now().UTC(),
		Servers:   make([]types.FleetItem, 0, len(servers)),
	}

	for _, s := range servers {
		item := toFleetItem(s, idx, running[s.ID], cpu[s.ID])
		fleet.Servers = append(fleet.Servers, item)

		fleet.Summary.Total++
		if s.Status == "running" {
			fleet.Summary.Running++
		}
		fleet.Summary.VCPU += s.ServerType.Cores
		fleet.Summary.MemoryGB += s.ServerType.Memory
		fleet.Summary.DiskGB += s.PrimaryDiskSize
		if s.OutgoingTraffic != nil {
			fleet.Summary.OutBytes += *s.OutgoingTraffic
		}
		if item.PriceUnknown {
			fleet.Summary.Legacy++
		} else {
			fleet.Summary.Monthly += item.Price
		}
	}

	fleetCache.set("fleet", fleet, fleetTTL)
	return fleet, nil
}

func currencyOr(idx *pricingIndex, def string) string {
	if idx != nil && idx.currency != "" {
		return idx.currency
	}
	return def
}

// toFleetItem converts one API server into its list view.
func toFleetItem(s hetzner.Server, idx *pricingIndex, action hetzner.Action, cpu *types.CPUInfo) types.FleetItem {
	loc := serverLocation(s)
	item := types.FleetItem{
		ID:     s.ID,
		Name:   s.Name,
		Status: s.Status,
		Type: types.TypeInfo{
			Name:       s.ServerType.Name,
			Cores:      s.ServerType.Cores,
			MemoryGB:   s.ServerType.Memory,
			DiskGB:     s.ServerType.Disk,
			CPUType:    s.ServerType.CPUType,
			Arch:       s.ServerType.Architecture,
			Storage:    s.ServerType.StorageType,
			Category:   s.ServerType.Category,
			Deprecated: s.ServerType.Deprecated,
		},
		Location: types.LocationInfo{
			Code:    locCode(loc.Name),
			City:    loc.City,
			Country: loc.Country,
			Zone:    loc.NetworkZone,
		},
		Locked:         s.Locked,
		Rescue:         s.RescueEnabled,
		ISO:            s.ISO != nil,
		Backups:        s.BackupWindow != nil && *s.BackupWindow != "",
		ProtectDelete:  s.Protection.Delete,
		ProtectRebuild: s.Protection.Rebuild,
		Price:          serverMonthlyPrice(idx, s.ServerType.Name, loc.Name),
		Created:        s.Created,
		LegacyPrice:    s.Created.Before(priceChange2026),
		CPU:            cpu,
	}
	if item.LegacyPrice {
		if p, ok := legacyMonthly(s.ServerType.Name, loc.Name); ok {
			// the table is net (as Hetzner publishes it); show it with VAT
			// like every other price
			item.Price = math.Round(p*idx.vatFactor()*100) / 100
		} else {
			item.PriceUnknown = true
		}
	}
	if s.PublicNet.IPv4 != nil {
		item.IPv4 = s.PublicNet.IPv4.IP
		item.IPBlocked = s.PublicNet.IPv4.Blocked
	}
	if s.PublicNet.IPv6 != nil {
		item.IPv6 = s.PublicNet.IPv6.IP
		item.IPBlocked = item.IPBlocked || s.PublicNet.IPv6.Blocked
	}
	if s.Image != nil {
		item.Image = s.Image.Description
	}
	if s.OutgoingTraffic != nil {
		item.Traffic.OutBytes = *s.OutgoingTraffic
	}
	if s.IngoingTraffic != nil {
		item.Traffic.InBytes = *s.IngoingTraffic
	}
	item.Traffic.IncludedBytes = s.IncludedTraffic

	if action.ID != 0 {
		item.Busy = &types.Busy{Command: action.Command, Progress: action.Progress}
	}
	return item
}

// serverLocation prefers the server's own location; the nested datacenter is
// a legacy fallback that newer API responses no longer include.
func serverLocation(s hetzner.Server) hetzner.Location {
	if s.Location.Name != "" {
		return s.Location
	}
	if s.Datacenter != nil {
		return s.Datacenter.Location
	}
	return hetzner.Location{}
}

// datacenterName is empty when the API no longer reports a datacenter.
func datacenterName(s hetzner.Server) string {
	if s.Datacenter != nil {
		return s.Datacenter.Name
	}
	return ""
}

// cpuForServers fetches the last-hour CPU series for running servers, in
// parallel, tolerating per-server failures (a card without a chart beats a
// failed list).
//
// The sparklines are decoration, so they are the first thing to give up when
// the token is close to its hourly Hetzner quota: one fleet rebuild costs
// 1 + N requests, and burning the window would starve every mutation in the
// panel (429 on rename/power/delete).
func cpuForServers(ctx context.Context, servers []hetzner.Server) map[int64]*types.CPUInfo {
	out := map[int64]*types.CPUInfo{}
	var mu sync.Mutex
	var wg sync.WaitGroup

	now := time.Now().UTC()
	sem := make(chan struct{}, 4)

	var want []hetzner.Server
	for _, s := range servers {
		if s.Status == "running" {
			want = append(want, s)
		}
	}
	if len(want) == 0 {
		return out
	}
	// +1 for the listing request this fleet build still has to pay for, +5 slack
	if !hcloud.RateLimit().Enough(len(want) + 6) {
		log.Printf("[hetzner] quota guard: skipping %d CPU sparklines (rate limit %d/%d left)",
			len(want), hcloud.RateLimit().Remaining, hcloud.RateLimit().Limit)
		return out
	}

	for _, s := range want {
		wg.Add(1)
		go func(s hetzner.Server) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			m, err := hcloud.ServerMetrics(ctx, s.ID, []string{"cpu"}, now.Add(-time.Hour), now, 300)
			if err != nil {
				return
			}
			vals := series(m, "cpu")
			if len(vals) == 0 {
				return
			}
			// Hetzner sums CPU across cores (a 12-core box can report 175%);
			// the UI is utilization, so divide by the core count.
			if s.ServerType.Cores > 0 {
				vals = scale(vals, 1/float64(s.ServerType.Cores))
			}

			info := &types.CPUInfo{Series: vals, Now: vals[len(vals)-1]}
			mu.Lock()
			out[s.ID] = info
			mu.Unlock()
		}(s)
	}
	wg.Wait()
	return out
}
