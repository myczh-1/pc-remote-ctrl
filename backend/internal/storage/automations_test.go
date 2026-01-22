package storage

import (
	"path/filepath"
	"testing"
	"time"
)

func TestAutomationsList_FiltersAndPagination(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "automations.db")
	a := NewAutomations(dbPath)
	if err := a.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}

	baseTS := time.Now().UnixMilli()
	seed := []Automation{
		{ID: "a", Name: "Kitchen Lights", Tags: []string{"kitchen"}, Enabled: true, UpdatedAt: baseTS + 3},
		{ID: "b", Name: "Bedroom Lights", Tags: []string{"bedroom"}, Enabled: true, UpdatedAt: baseTS + 2},
		{ID: "c", Name: "Kitchen Fan", Tags: []string{"kitchen", "fan"}, Enabled: true, UpdatedAt: baseTS + 1},
	}
	for _, auto := range seed {
		if err := a.Upsert(auto); err != nil {
			t.Fatalf("Upsert %s: %v", auto.ID, err)
		}
	}

	// Name filter (case-insensitive substring)
	{
		out, next, err := a.List(ListAutomationsOptions{NameContains: "KITCH", PageSize: 50, IncludeDisabled: true})
		if err != nil {
			t.Fatalf("List name filter: %v", err)
		}
		if next != "" {
			t.Fatalf("expected empty next token, got %q", next)
		}
		if len(out) != 2 {
			t.Fatalf("expected 2 automations, got %d", len(out))
		}
		if out[0].ID != "a" || out[1].ID != "c" {
			t.Fatalf("unexpected order/ids: got %v,%v", out[0].ID, out[1].ID)
		}
	}

	// Tag filter (best-effort JSON substring match)
	{
		out, next, err := a.List(ListAutomationsOptions{Tag: "kitchen", PageSize: 50, IncludeDisabled: true})
		if err != nil {
			t.Fatalf("List tag filter: %v", err)
		}
		if next != "" {
			t.Fatalf("expected empty next token, got %q", next)
		}
		if len(out) != 2 {
			t.Fatalf("expected 2 automations, got %d", len(out))
		}
		if out[0].ID != "a" || out[1].ID != "c" {
			t.Fatalf("unexpected order/ids: got %v,%v", out[0].ID, out[1].ID)
		}
	}

	// Pagination token shape + stability
	{
		out1, next1, err := a.List(ListAutomationsOptions{PageSize: 1, IncludeDisabled: true})
		if err != nil {
			t.Fatalf("List page1: %v", err)
		}
		if len(out1) != 1 {
			t.Fatalf("expected 1 automation, got %d", len(out1))
		}
		if next1 == "" {
			t.Fatalf("expected non-empty next token")
		}

		out2, next2, err := a.List(ListAutomationsOptions{PageSize: 2, PageToken: next1, IncludeDisabled: true})
		if err != nil {
			t.Fatalf("List page2: %v", err)
		}
		if len(out2) != 2 {
			t.Fatalf("expected 2 automations on page2, got %d", len(out2))
		}
		if next2 != "" {
			t.Fatalf("expected empty next token on last page, got %q", next2)
		}

		seen := map[string]bool{out1[0].ID: true}
		for _, a2 := range out2 {
			if seen[a2.ID] {
				t.Fatalf("duplicate id across pages: %s", a2.ID)
			}
			seen[a2.ID] = true
		}
		if len(seen) != 3 {
			t.Fatalf("expected to see 3 unique ids, got %d", len(seen))
		}
	}
}
