package hetzner

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestGetResourceUnwrapsEnvelope(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/volumes/5" {
			t.Errorf("%s %s, want GET /volumes/5", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"volume":{"id":5,"name":"data","size":20,"linux_device":"/dev/sdb"}}`))
	}))

	v, err := c.Volume(context.Background(), 5)
	if err != nil {
		t.Fatalf("Volume: %v", err)
	}
	if v.ID != 5 || v.Name != "data" || v.Size != 20 {
		t.Errorf("volume = %+v", v)
	}
	if v.Format != nil {
		t.Errorf("format = %v, want nil when the API omits it", *v.Format)
	}
}

func TestGetResourceMissingKeyFails(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"wrong":{"id":5}}`))
	}))

	_, err := c.Volume(context.Background(), 5)
	if err == nil || !strings.Contains(err.Error(), "no \"volume\"") {
		t.Errorf("error = %v, want a missing-envelope error", err)
	}
}

func TestUpdateResourceSendsTypedBody(t *testing.T) {
	var got map[string]any
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut || r.URL.Path != "/servers/3" {
			t.Errorf("%s %s, want PUT /servers/3", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Errorf("decode body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"server":{"id":3,"name":"renamed"}}`))
	}))

	s, err := c.ServerUpdate(context.Background(), 3, ServerUpdateRequest{Name: "renamed"})
	if err != nil {
		t.Fatalf("ServerUpdate: %v", err)
	}
	if s.Name != "renamed" {
		t.Errorf("name = %q", s.Name)
	}
	// The struct only exposes name and labels, so nothing else can leak out.
	if len(got) != 1 || got["name"] != "renamed" {
		t.Errorf("body = %v, want exactly {name: renamed}", got)
	}
}

func TestDeleteResourceEmptyBody(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete || r.URL.Path != "/ssh_keys/9" {
			t.Errorf("%s %s, want DELETE /ssh_keys/9", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	if err := c.SSHKeyDelete(context.Background(), 9); err != nil {
		t.Fatalf("SSHKeyDelete: %v", err)
	}
}

func TestDeleteServerReturnsAction(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"action":{"id":77,"command":"delete_server","status":"running"}}`))
	}))

	a, err := c.ServerDelete(context.Background(), 4)
	if err != nil {
		t.Fatalf("ServerDelete: %v", err)
	}
	if a == nil || a.ID != 77 {
		t.Fatalf("action = %+v, want id 77", a)
	}
}

func TestCreateResourceDecodesCollectionEnvelope(t *testing.T) {
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/volumes" {
			t.Errorf("%s %s, want POST /volumes", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"volume":{"id":1,"name":"v"},"action":{"id":2,"command":"create_volume"}}`))
	}))

	res, err := c.VolumeCreate(context.Background(), VolumeCreateRequest{Name: "v", Size: 10})
	if err != nil {
		t.Fatalf("VolumeCreate: %v", err)
	}
	if res.Volume.ID != 1 {
		t.Errorf("volume = %+v", res.Volume)
	}
	if res.Action == nil || res.Action.ID != 2 {
		t.Errorf("action = %+v", res.Action)
	}
}

func TestResourceActionPathAndPayload(t *testing.T) {
	var path string
	var body map[string]any
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		if r.Body != nil {
			_ = json.NewDecoder(r.Body).Decode(&body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"action":{"id":8,"command":"resize_volume","status":"running"}}`))
	}))

	res, err := c.DoVolumeAction(context.Background(), 12, "resize", map[string]any{"size": 40})
	if err != nil {
		t.Fatalf("DoVolumeAction: %v", err)
	}
	if path != "/volumes/12/actions/resize" {
		t.Errorf("path = %s", path)
	}
	if body["size"] != float64(40) {
		t.Errorf("body = %v", body)
	}
	if res.First().Command != "resize_volume" {
		t.Errorf("action = %+v", res.First())
	}
}

func TestResourceActionsUsesNewestFirstSort(t *testing.T) {
	var query string
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/load_balancers/3/actions" {
			t.Errorf("path = %s", r.URL.Path)
		}
		query = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"actions":[{"id":4}],"meta":{"pagination":{"page":1,"per_page":12,"total_entries":9}}}`))
	}))

	actions, total, err := c.LoadBalancerActions(context.Background(), 3, 12)
	if err != nil {
		t.Fatalf("LoadBalancerActions: %v", err)
	}
	if !strings.Contains(query, "sort=id%3Adesc") && !strings.Contains(query, "sort=id:desc") {
		t.Errorf("query = %q, want sort=id:desc", query)
	}
	if len(actions) != 1 || total != 9 {
		t.Errorf("actions=%v total=%d", actions, total)
	}
}
