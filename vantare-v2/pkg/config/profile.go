package config

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
)

// DisplayMode controls the overlay window behavior.
type DisplayMode string

const (
	ModeRacing    DisplayMode = "racing"    // shrink-wrap, click-through
	ModeEdit      DisplayMode = "edit"      // fullscreen, draggable widgets
	ModeStreaming DisplayMode = "streaming" // load-only in F4; no window in F6
)

// Rect defines a widget's position and size in profile coordinates.
type Rect struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

// WidgetConfig describes one overlay widget.
type WidgetConfig struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"` // delta | relative | standings
	Enabled  bool           `json:"enabled"`
	UpdateHz int            `json:"updateHz,omitempty"`
	Position Rect           `json:"position"`
	Props    map[string]any `json:"props,omitempty"`
}

// ProfileConfig is the top-level JSON schema for a layout profile.
type ProfileConfig struct {
	ID           string        `json:"id,omitempty"`
	Name         string        `json:"name,omitempty"`
	DisplayMode  DisplayMode   `json:"displayMode"`
	MonitorIndex int           `json:"monitorIndex"`
	Widgets      []WidgetConfig `json:"widgets"`
}

// LoadFile reads a profile JSON from disk.
func LoadFile(path string) (*ProfileConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read profile %s: %w", path, err)
	}
	var p ProfileConfig
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("parse profile %s: %w", path, err)
	}
	return &p, nil
}

// SaveFile writes the profile to disk as pretty JSON.
func SaveFile(path string, p *ProfileConfig) error {
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal profile: %w", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("write profile %s: %w", path, err)
	}
	return nil
}

// CompositeBounds returns the bounding box that encloses all enabled widgets
// with the given padding applied on each side.
// If no widgets are enabled, returns a minimum 200×80 rect.
func CompositeBounds(p *ProfileConfig, pad int) Rect {
	minX, minY := math.MaxInt, math.MaxInt
	maxX, maxY := math.MinInt, math.MinInt
	count := 0

	for _, w := range p.Widgets {
		if !w.Enabled {
			continue
		}
		count++
		if w.Position.X < minX {
			minX = w.Position.X
		}
		if w.Position.Y < minY {
			minY = w.Position.Y
		}
		ex := w.Position.X + w.Position.W
		ey := w.Position.Y + w.Position.H
		if ex > maxX {
			maxX = ex
		}
		if ey > maxY {
			maxY = ey
		}
	}

	if count == 0 {
		return Rect{X: 0, Y: 0, W: 200, H: 80}
	}

	return Rect{
		X: minX - pad,
		Y: minY - pad,
		W: (maxX - minX) + pad*2,
		H: (maxY - minY) + pad*2,
	}
}

// LayoutOrigin returns the virtual-desktop origin of the bounding box.
// Widgets at (x, y) become (x - origin.X, y - origin.Y) in window-local coords.
func LayoutOrigin(p *ProfileConfig, pad int) Rect {
	b := CompositeBounds(p, pad)
	return Rect{X: b.X, Y: b.Y, W: 0, H: 0}
}
