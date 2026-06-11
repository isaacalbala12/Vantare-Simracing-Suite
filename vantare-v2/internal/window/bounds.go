package window

import (
	"github.com/vantare/overlays/v2/pkg/config"
)

// WailsRect mirrors application.Rect for testability without importing Wails.
type WailsRect struct {
	X      int
	Y      int
	Width  int
	Height int
}

// ShrinkWrap computes the window bounds that tightly enclose all enabled
// widgets, offset so widget positions become window-local coordinates.
// Returns (windowBounds, layoutOrigin) where:
//   - windowBounds is in virtual-desktop space
//   - layoutOrigin is the window-local offset to subtract from widget positions
func ShrinkWrap(p *config.ProfileConfig, pad int) (window WailsRect, origin config.Rect) {
	b := config.CompositeBounds(p, pad)
	return WailsRect{
			X:      b.X,
			Y:      b.Y,
			Width:  b.W,
			Height: b.H,
		}, config.Rect{
			X: b.X,
			Y: b.Y,
		}
}

// WindowLocalPos converts a widget's virtual-desktop position to window-local
// coordinates by subtracting the layout origin.
func WindowLocalPos(widgetPos config.Rect, origin config.Rect) config.Rect {
	return config.Rect{
		X: widgetPos.X - origin.X,
		Y: widgetPos.Y - origin.Y,
		W: widgetPos.W,
		H: widgetPos.H,
	}
}
