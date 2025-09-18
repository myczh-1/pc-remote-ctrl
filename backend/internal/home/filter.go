package home

import (
	"pc-remote-ctrl/backend/internal/storage"
)

// DeviceFilter implements a composable filter pattern for devices
// Good taste: single responsibility, no special cases
type DeviceFilter interface {
	Match(*storage.Device) bool
}

// FilterFunc allows functions to implement DeviceFilter
type FilterFunc func(*storage.Device) bool

func (f FilterFunc) Match(d *storage.Device) bool {
	return f(d)
}

// IDFilter filters by device ID
type IDFilter struct {
	ids map[string]bool
}

func NewIDFilter(ids []string) DeviceFilter {
	if len(ids) == 0 {
		return nil
	}
	m := make(map[string]bool, len(ids))
	for _, id := range ids {
		m[id] = true
	}
	return &IDFilter{ids: m}
}

func (f *IDFilter) Match(d *storage.Device) bool {
	return f.ids[d.ID]
}

// TypeFilter filters by device type
type TypeFilter string

func (f TypeFilter) Match(d *storage.Device) bool {
	return string(f) == d.Type
}

// RoomFilter filters by room
type RoomFilter string

func (f RoomFilter) Match(d *storage.Device) bool {
	return string(f) == d.Room
}

// TagFilter filters by tags (matches if device has ANY of the tags)
type TagFilter struct {
	tags map[string]bool
}

func NewTagFilter(tags []string) DeviceFilter {
	if len(tags) == 0 {
		return nil
	}
	m := make(map[string]bool, len(tags))
	for _, tag := range tags {
		m[tag] = true
	}
	return &TagFilter{tags: m}
}

func (f *TagFilter) Match(d *storage.Device) bool {
	for _, tag := range d.Tags {
		if f.tags[tag] {
			return true
		}
	}
	return false
}

// CompositeFilter combines multiple filters with AND logic
// Linus: "Good code has no special cases" - all filters treated equally
type CompositeFilter struct {
	filters []DeviceFilter
}

func NewCompositeFilter(filters ...DeviceFilter) DeviceFilter {
	// Remove nil filters (no special case handling in Match)
	var valid []DeviceFilter
	for _, f := range filters {
		if f != nil {
			valid = append(valid, f)
		}
	}
	if len(valid) == 0 {
		// No filters = match all
		return FilterFunc(func(*storage.Device) bool { return true })
	}
	if len(valid) == 1 {
		// Single filter doesn't need composite wrapper
		return valid[0]
	}
	return &CompositeFilter{filters: valid}
}

func (c *CompositeFilter) Match(d *storage.Device) bool {
	// All filters must match (AND logic)
	for _, f := range c.filters {
		if !f.Match(d) {
			return false
		}
	}
	return true
}

// FilterDevices applies filter to device list
// Clean separation of filtering logic from data retrieval
func FilterDevices(devices []storage.Device, filter DeviceFilter) []storage.Device {
	if filter == nil {
		// No filter = return all
		return devices
	}

	var result []storage.Device
	for _, d := range devices {
		if filter.Match(&d) {
			result = append(result, d)
		}
	}
	return result
}