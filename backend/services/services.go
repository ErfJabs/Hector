// Package services holds the business logic: it talks to the Hetzner client,
// assembles the JSON views the frontend renders, and orchestrates multi-step
// operations. Handlers never call the Hetzner client directly.
package services

import (
	"context"
	"strconv"
	"strings"
	"time"

	"hector/backend/hetzner"
	"hector/backend/types"
)

var hcloud *hetzner.Client

// Init wires the single Hetzner client used by every service.
func Init(client *hetzner.Client) {
	hcloud = client
}

// Ready reports whether a client is wired (handlers guard with this).
func Ready() bool { return hcloud != nil }

// locCode turns "fsn1" into "FSN1".
func locCode(name string) string { return strings.ToUpper(name) }

// shownPrice is the price the UI shows: gross, i.e. including the VAT
// Hetzner applies to *this* account — the same figure the Hetzner console
// shows (net × 1.24 on a 24 % account, e.g. CCX13 €42.99 → €53.31). Net
// is only a fallback when the API sends no gross value.
func shownPrice(p hetzner.Price) float64 {
	if v, err := strconv.ParseFloat(p.Gross, 64); err == nil && v > 0 {
		return v
	}
	v, _ := strconv.ParseFloat(p.Net, 64)
	return v
}

// vatFactor turns a net price into the account's gross price (1 + vat/100);
// 1 when the rate is unknown.
func (idx *pricingIndex) vatFactor() float64 {
	if idx == nil {
		return 1
	}
	v, err := strconv.ParseFloat(idx.vatRate, 64)
	if err != nil || v < 0 {
		return 1
	}
	return 1 + v/100
}

// series returns the numeric values of one named metric time series.
func series(m *hetzner.Metrics, key string) []float64 {
	ts, ok := m.TimeSeries[key]
	if !ok {
		return nil
	}
	out := make([]float64, 0, len(ts.Values))
	for _, pair := range ts.Values {
		if len(pair) != 2 {
			continue
		}
		var v float64
		switch raw := pair[1].(type) {
		case string:
			v, _ = strconv.ParseFloat(raw, 64)
		case float64:
			v = raw
		}
		out = append(out, v)
	}
	return out
}

// pick tries several metric series names and returns the first present.
// Hetzner renamed bandwidth series when it moved to the time_series format;
// old and new names both appear in the wild.
func pick(m *hetzner.Metrics, keys ...string) []float64 {
	for _, k := range keys {
		if s := series(m, k); len(s) > 0 {
			return s
		}
	}
	return nil
}

func avg(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	var sum float64
	for _, v := range vals {
		sum += v
	}
	return sum / float64(len(vals))
}

func actionInfo(a hetzner.Action) types.ActionInfo {
	info := types.ActionInfo{
		ID:       a.ID,
		Command:  a.Command,
		Status:   a.Status,
		Progress: a.Progress,
		Started:  a.Started,
		Finished: a.Finished,
	}
	if a.Finished != nil {
		info.DurationS = int(a.Finished.Sub(a.Started).Seconds())
	}
	if a.Error != nil {
		info.ErrorCode = a.Error.Code
		info.ErrorMessage = a.Error.Message
	}
	return info
}

// ---- pricing index -----------------------------------------------------

type priceInfo struct {
	monthly float64
	hourly  float64
	classes map[string]types.TypePrice // location code -> price
}

type pricingIndex struct {
	currency string
	vatRate  string
	backup   string
	types    map[string]priceInfo // server type name -> info
}

var pricingCache = newTTLCache[*pricingIndex]()

const pricingTTL = 10 * time.Minute

func prices(ctx context.Context) (*pricingIndex, error) {
	if v, ok := pricingCache.get("pricing"); ok {
		return v, nil
	}
	raw, err := hcloud.Pricing(ctx)
	if err != nil {
		return nil, err
	}

	idx := &pricingIndex{
		currency: raw.Currency,
		vatRate:  raw.VATRate,
		backup:   raw.ServerBackup.Percentage,
		types:    map[string]priceInfo{},
	}
	for _, st := range raw.ServerTypes {
		info := priceInfo{classes: map[string]types.TypePrice{}}
		for _, p := range st.Prices {
			code := locCode(p.Location)
			info.classes[code] = types.TypePrice{
				Monthly:    shownPrice(p.PriceMonthly),
				Hourly:     shownPrice(p.PriceHourly),
				IncludedGB: p.IncludedTraffic >> 30, // bytes -> GiB, display-only
			}
		}
		idx.types[st.Name] = info
	}
	pricingCache.set("pricing", idx, pricingTTL)
	return idx, nil
}

// serverMonthlyPrice returns the (gross, see shownPrice) monthly price of a server type in a
// location, or 0 when pricing is unavailable.
func serverMonthlyPrice(idx *pricingIndex, typeName, location string) float64 {
	if idx == nil {
		return 0
	}
	info, ok := idx.types[typeName]
	if !ok {
		return 0
	}
	p, ok := info.classes[locCode(location)]
	if !ok {
		return 0
	}
	return p.Monthly
}
