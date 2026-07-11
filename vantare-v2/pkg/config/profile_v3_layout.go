package config

import "math"

// CompositeBoundsV3 returns the bounding box of enabled widgets in the general layout.
func CompositeBoundsV3(doc *ProfileDocumentV3, pad int) Rect {
	if doc == nil {
		return Rect{X: 0, Y: 0, W: 0, H: 0}
	}
	general, ok := doc.Layouts[LayoutGeneral]
	if !ok {
		return Rect{X: 0, Y: 0, W: 0, H: 0}
	}

	minX, minY := math.MaxInt, math.MaxInt
	maxX, maxY := math.MinInt, math.MinInt
	count := 0

	for _, widget := range general.Widgets {
		if !widget.Behavior.Enabled {
			continue
		}
		count++
		if widget.Layout.X < minX {
			minX = widget.Layout.X
		}
		if widget.Layout.Y < minY {
			minY = widget.Layout.Y
		}
		ex := widget.Layout.X + widget.Layout.W
		ey := widget.Layout.Y + widget.Layout.H
		if ex > maxX {
			maxX = ex
		}
		if ey > maxY {
			maxY = ey
		}
	}

	if count == 0 {
		return Rect{X: 0, Y: 0, W: 0, H: 0}
	}

	return Rect{
		X: minX - pad,
		Y: minY - pad,
		W: (maxX - minX) + pad*2,
		H: (maxY - minY) + pad*2,
	}
}

// LayoutOriginV3 returns the virtual-desktop origin for window-local widget coordinates.
func LayoutOriginV3(doc *ProfileDocumentV3, pad int) Rect {
	bounds := CompositeBoundsV3(doc, pad)
	return Rect{X: bounds.X, Y: bounds.Y, W: 0, H: 0}
}
