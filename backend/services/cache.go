package services

import (
	"sync"
	"time"
)

// ttlCache is a tiny in-memory cache with per-entry expiry. The panel has no
// database; this is all the persistence there is.
type ttlCache[T any] struct {
	mu    sync.Mutex
	items map[string]ttlEntry[T]
}

type ttlEntry[T any] struct {
	val T
	exp time.Time
}

func newTTLCache[T any]() *ttlCache[T] {
	return &ttlCache[T]{items: map[string]ttlEntry[T]{}}
}

func (c *ttlCache[T]) get(key string) (T, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.items[key]
	if !ok || time.Now().After(entry.exp) {
		var zero T
		if ok {
			delete(c.items, key)
		}
		return zero, false
	}
	return entry.val, true
}

func (c *ttlCache[T]) set(key string, val T, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = ttlEntry[T]{val: val, exp: time.Now().Add(ttl)}
}

func (c *ttlCache[T]) del(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.items, key)
}
