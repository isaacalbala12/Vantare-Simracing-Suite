package window

import (
	"math"

	"github.com/vantare/overlays/v2/pkg/config"
)

// OverlayGeometry describes the selected monitor and the cost-aware desktop
// window rectangle in Wails logical screen coordinates.
type OverlayGeometry struct {
	Window        WailsRect
	Monitor       WailsRect
	ShrinkWrapped bool
}

// ResolveOverlayGeometry encloses every enabled widget from every profile
// layout. Levels 1-2 and edit mode deliberately retain the whole monitor.
func ResolveOverlayGeometry(document *config.ProfileDocumentV3, monitor WailsRect, level, margin int) OverlayGeometry {
	full := OverlayGeometry{Window: monitor, Monitor: monitor}
	if document == nil || level < 3 || document.DisplayMode == config.ModeEdit || monitor.Width <= 0 || monitor.Height <= 0 {
		return full
	}

	viewport := config.ResolveLayoutViewportV3(document)
	if viewport.Width <= 0 || viewport.Height <= 0 {
		return full
	}

	minX, minY := math.MaxFloat64, math.MaxFloat64
	maxX, maxY := -math.MaxFloat64, -math.MaxFloat64
	found := false
	for _, layout := range document.Layouts {
		for _, widget := range layout.Widgets {
			if !widget.Behavior.Enabled || widget.Layout.W <= 0 || widget.Layout.H <= 0 {
				continue
			}
			found = true
			minX = math.Min(minX, float64(widget.Layout.X))
			minY = math.Min(minY, float64(widget.Layout.Y))
			maxX = math.Max(maxX, float64(widget.Layout.X+widget.Layout.W))
			maxY = math.Max(maxY, float64(widget.Layout.Y+widget.Layout.H))
		}
	}
	if !found {
		return full
	}

	scale := math.Min(float64(monitor.Width)/float64(viewport.Width), float64(monitor.Height)/float64(viewport.Height))
	offsetX := (float64(monitor.Width) - float64(viewport.Width)*scale) / 2
	offsetY := (float64(monitor.Height) - float64(viewport.Height)*scale) / 2
	left := int(math.Floor(offsetX+minX*scale)) - margin
	top := int(math.Floor(offsetY+minY*scale)) - margin
	right := int(math.Ceil(offsetX+maxX*scale)) + margin
	bottom := int(math.Ceil(offsetY+maxY*scale)) + margin
	left = max(0, left)
	top = max(0, top)
	right = min(monitor.Width, right)
	bottom = min(monitor.Height, bottom)
	if right <= left || bottom <= top {
		return full
	}

	return OverlayGeometry{
		Window:  WailsRect{X: monitor.X + left, Y: monitor.Y + top, Width: right - left, Height: bottom - top},
		Monitor: monitor, ShrinkWrapped: true,
	}
}
