package services

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"hector/backend/types"
)

// ErrJobRunning is returned when a server already has an orchestration job.
var ErrJobRunning = errors.New("an action is already running for this server")

// jobs keeps multi-step orchestration state in memory. There is no database
// by design: a restart mid-rescale loses the job record but not the reality —
// the Hetzner action keeps running and the server screenshot/actions show it.
type jobManager struct {
	mu       sync.Mutex
	byServer map[int64]*types.Job
}

var jobs = &jobManager{byServer: map[int64]*types.Job{}}

// CurrentJob returns the latest job for a server, if any.
func CurrentJob(serverID int64) *types.Job {
	jobs.mu.Lock()
	defer jobs.mu.Unlock()
	return jobs.byServer[serverID]
}

// Rescue orchestrates the rescale flow the design promises:
// shutdown (only when running) -> wait for off -> change_type.
// Returns a conflict error when a job is already in flight for the server.
func Rescale(ctx context.Context, serverID int64, newType string, upgradeDisk bool) (*types.Job, error) {
	if newType == "" {
		return nil, fmt.Errorf("server_type is required")
	}

	jobs.mu.Lock()
	if job := jobs.byServer[serverID]; job != nil && job.Status == "running" {
		jobs.mu.Unlock()
		return nil, ErrJobRunning
	}
	job := &types.Job{
		ID:       fmt.Sprintf("%d-%d", serverID, time.Now().Unix()),
		ServerID: serverID,
		Kind:     "rescale",
		Status:   "running",
		Steps: []types.JobStep{
			{Key: "shutdown", Status: "pending"},
			{Key: "change_type", Status: "pending"},
		},
	}
	jobs.byServer[serverID] = job
	jobs.mu.Unlock()

	go runRescale(serverID, newType, upgradeDisk, job)
	return job, nil
}

func runRescale(serverID int64, newType string, upgradeDisk bool, job *types.Job) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()

	step := func(i int) *types.JobStep { return &job.Steps[i] }

	fail := func(i int, err error) {
		step(i).Status = "error"
		step(i).Error = err.Error()
		job.Status = "error"
		job.Error = err.Error()
	}
	update := func(mutate func()) { jobs.mu.Lock(); mutate(); jobs.mu.Unlock() }

	server, err := hcloud.Server(ctx, serverID)
	if err != nil {
		update(func() { fail(0, err) })
		return
	}

	// 1) shutdown, only when the server is on
	if server.Status == "running" {
		update(func() { step(0).Status = "running" })
		action, err := hcloud.DoServerAction(ctx, serverID, "shutdown", nil)
		if err != nil {
			update(func() { fail(0, err) })
			return
		}
		update(func() { step(0).Progress = action.Action.Progress })
		if err := waitAction(ctx, action.Action.ID, func(p int) { update(func() { step(0).Progress = p }) }); err != nil {
			update(func() { fail(0, err) })
			return
		}
		if err := waitServerOff(ctx, serverID); err != nil {
			update(func() { fail(0, err) })
			return
		}
		update(func() { step(0).Status = "success"; step(0).Progress = 100 })
	} else {
		update(func() { step(0).Status = "skipped" })
	}

	// 2) change_type
	update(func() { step(1).Status = "running" })
	action, err := hcloud.DoServerAction(ctx, serverID, "change_type", map[string]any{
		"server_type":  newType,
		"upgrade_disk": upgradeDisk,
	})
	if err != nil {
		update(func() { fail(1, err) })
		return
	}
	if err := waitAction(ctx, action.Action.ID, func(p int) { update(func() { step(1).Progress = p }) }); err != nil {
		update(func() { fail(1, err) })
		return
	}

	update(func() {
		step(1).Status = "success"
		step(1).Progress = 100
		job.Status = "success"
	})
	fleetCache.del("fleet")
}

// waitAction polls one Hetzner action until it finishes.
func waitAction(ctx context.Context, id int64, onProgress func(int)) error {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return errors.New("timed out waiting for the action")
		case <-ticker.C:
			a, err := hcloud.Action(ctx, id)
			if err != nil {
				return err
			}
			if onProgress != nil {
				onProgress(a.Progress)
			}
			switch a.Status {
			case "success":
				return nil
			case "error":
				if a.Error != nil {
					return fmt.Errorf("%s: %s", a.Error.Code, a.Error.Message)
				}
				return errors.New("action failed")
			}
		}
	}
}

// waitServerOff polls the server status after a shutdown.
func waitServerOff(ctx context.Context, id int64) error {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return errors.New("timed out waiting for the server to power off")
		case <-ticker.C:
			s, err := hcloud.Server(ctx, id)
			if err != nil {
				return err
			}
			if s.Status == "off" {
				return nil
			}
		}
	}
}
