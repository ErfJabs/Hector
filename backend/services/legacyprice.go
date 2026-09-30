package services

import "strings"

// legacyPrices are Hetzner's monthly net prices (EUR, excl. primary IPv4)
// that were valid until the 15 Jun 2026 price adjustment — the "old price"
// column of docs.hetzner.com/general/infrastructure-and-availability/price-adjustment.
// Servers ordered before that date keep being billed at these; the API only
// returns today's list price, so this table is the only source.
//
// ponytail: types missing here (retired before 2026, e.g. cx22/cpx11 in EU)
// fall back to "legacy, price unknown". Extend the table if one shows up.
var legacyPrices = map[string]map[string]float64{
	"eu": { // FSN1, NBG1, HEL1
		"cax11": 4.49, "cax21": 7.99, "cax31": 15.99, "cax41": 31.49,
		"ccx13": 15.99, "ccx23": 31.49, "ccx33": 62.49, "ccx43": 124.99, "ccx53": 249.99, "ccx63": 374.49,
		"cpx22": 7.99, "cpx32": 13.99, "cpx42": 25.49, "cpx52": 36.49, "cpx62": 50.49,
		"cx23": 3.99, "cx33": 6.49, "cx43": 11.99, "cx53": 22.49,
	},
	"us": { // ASH, HIL
		"ccx13": 16.99, "ccx23": 33.99, "ccx33": 64.99, "ccx43": 129.99, "ccx53": 259.99, "ccx63": 389.99,
		"cpx11": 5.99, "cpx21": 11.99, "cpx31": 20.99, "cpx41": 38.99, "cpx51": 77.99,
	},
	"sin": {
		"ccx13": 27.49, "ccx23": 51.49, "ccx33": 96.99, "ccx43": 178.49, "ccx53": 382.49, "ccx63": 626.99,
		"cpx12": 7.99, "cpx22": 15.99, "cpx32": 32.49, "cpx42": 55.99, "cpx52": 77.99, "cpx62": 100.49,
	},
}

// legacyMonthly returns the pre-2026-06-15 monthly price of a type in a
// location, and whether the table knows it.
func legacyMonthly(typeName, location string) (float64, bool) {
	region := ""
	switch strings.ToLower(location) {
	case "fsn1", "nbg1", "hel1":
		region = "eu"
	case "ash", "hil":
		region = "us"
	case "sin":
		region = "sin"
	}
	p, ok := legacyPrices[region][strings.ToLower(typeName)]
	return p, ok
}
