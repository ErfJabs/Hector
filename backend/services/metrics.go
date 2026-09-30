package services

import (
	"context"
	"math"
	"time"

	"hector/backend/types"
)

// metricRanges mirror the five range buttons in the metrics UI. Steps are
// multiples of 60 s (Hetzner requirement) and keep each series under ~60
// points.
var metricRanges = map[string]struct {
	Window time.Duration
	Step   int
}{
	"1H":  {1 * time.Hour, 60},
	"6H":  {6 * time.Hour, 540},
	"24H": {24 * time.Hour, 2160},
	"7D":  {7 * 24 * time.Hour, 14400},
	"30D": {30 * 24 * time.Hour, 64800},
}

// ServerMetrics fetches cpu + disk + network series for one range and
// normalizes them for the charts.
//
// ponytail: units follow Hetzner's time_series docs — bandwidth series are
// bytes/s, converted here (disk -> MB/s, network -> Mbit/s). If a live token
// ever shows a 10^6 scale error, this function is the single place to fix.
func ServerMetrics(ctx context.Context, id int64, rangeKey string) (*types.MetricsView, error) {
	r, ok := metricRanges[rangeKey]
	if !ok {
		rangeKey, r = "24H", metricRanges["24H"]
	}

	now := time.Now().UTC()
	m, err := hcloud.ServerMetrics(ctx, id, []string{"cpu", "disk", "network"}, now.Add(-r.Window), now, r.Step)
	if err != nil {
		return nil, err
	}

	view := &types.MetricsView{Range: rangeKey, Step: r.Step}
	// A fresh server has no samples yet: the series must be [] not null
	// (null crashed the metrics screen).
	defer func() {
		nz := func(v []float64) []float64 {
			if v == nil {
				return []float64{}
			}
			return v
		}
		view.CPU.Series = nz(view.CPU.Series)
		view.Disk.Read, view.Disk.Write = nz(view.Disk.Read), nz(view.Disk.Write)
		view.Net.In, view.Net.Out = nz(view.Net.In), nz(view.Net.Out)
	}()

	cpu := series(m, "cpu")
	// The server object is needed for the core count — and it doubles as the
	// source for the detail extras (rDNS, recent actions, on-since, a fresh
	// base item). They ride on the metrics view, so opening a server costs
	// ONE request: the fleet list already has the base item.
	if server, err := hcloud.Server(ctx, id); err == nil {
		if server.ServerType.Cores > 0 {
			cpu = scale(cpu, 1/float64(server.ServerType.Cores))
		}
		view.Extras = serverExtras(ctx, *server)
	}
	if len(cpu) > 0 {
		peak := 0.0
		for _, v := range cpu {
			peak = math.Max(peak, v)
		}
		view.CPU = types.CPUMetrics{
			Series: cpu,
			Now:    cpu[len(cpu)-1],
			Avg:    round1(avg(cpu)),
			Peak:   round1(peak),
		}
	}

	toMB := func(vals []float64) []float64 { return scale(vals, 1/1e6) }
	toMbit := func(vals []float64) []float64 { return scale(vals, 8/1e6) }

	view.Disk = types.DiskMetrics{
		Read:      toMB(pick(m, "disk.0.bandwidth.read", "disk.0.read")),
		Write:     toMB(pick(m, "disk.0.bandwidth.write", "disk.0.write")),
		IOPSRead:  round1(avg(pick(m, "disk.0.iops.read"))),
		IOPSWrite: round1(avg(pick(m, "disk.0.iops.write"))),
	}
	view.Net = types.NetMetrics{
		In:     toMbit(pick(m, "network.0.bandwidth.in", "network.0.in")),
		Out:    toMbit(pick(m, "network.0.bandwidth.out", "network.0.out")),
		PPSIn:  round1(avg(pick(m, "network.0.pps.in"))),
		PPSOut: round1(avg(pick(m, "network.0.pps.out"))),
	}
	return view, nil
}

func scale(vals []float64, factor float64) []float64 {
	out := make([]float64, len(vals))
	for i, v := range vals {
		out[i] = v * factor
	}
	return out
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }
