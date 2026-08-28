package window_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
)

func geometryDocument(widgets ...config.WidgetInstanceV3) *config.ProfileDocumentV3 {
	return &config.ProfileDocumentV3{
		DisplayMode:    config.ModeRacing,
		LayoutViewport: &config.LayoutViewportV3{Width: 1920, Height: 1080},
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral, Widgets: widgets},
		},
	}
}

func enabledWidget(x, y, width, height int) config.WidgetInstanceV3 {
	return config.WidgetInstanceV3{
		Layout:   config.WidgetLayoutV3{X: x, Y: y, W: width, H: height},
		Behavior: config.WidgetBehaviorV3{Enabled: true},
	}
}

func TestResolveOverlayGeometryOppositeCornersUsesWholeMonitor(t *testing.T) {
	doc := geometryDocument(enabledWidget(0, 0, 100, 100), enabledWidget(1820, 980, 100, 100))
	monitor := window.WailsRect{X: -1920, Y: 0, Width: 1920, Height: 1080}
	got := window.ResolveOverlayGeometry(doc, monitor, 3, 16)
	if got.Window != monitor {
		t.Fatalf("window=%+v want whole monitor %+v", got.Window, monitor)
	}
}

func TestResolveOverlayGeometryClusterUsesSmallBox(t *testing.T) {
	doc := geometryDocument(enabledWidget(100, 200, 300, 100), enabledWidget(420, 220, 100, 80))
	monitor := window.WailsRect{X: 1920, Y: 0, Width: 1920, Height: 1080}
	got := window.ResolveOverlayGeometry(doc, monitor, 3, 16)
	want := window.WailsRect{X: 2004, Y: 184, Width: 452, Height: 132}
	if got.Window != want || !got.ShrinkWrapped {
		t.Fatalf("geometry=%+v want window %+v", got, want)
	}
}

func TestResolveOverlayGeometryUsesLogicalDPIBounds(t *testing.T) {
	doc := geometryDocument(enabledWidget(960, 540, 480, 270))
	// 1920x1080 physical at 150 percent is 1280x720 in Wails logical coords.
	monitor := window.WailsRect{X: 0, Y: 0, Width: 1280, Height: 720}
	got := window.ResolveOverlayGeometry(doc, monitor, 4, 16)
	want := window.WailsRect{X: 624, Y: 344, Width: 352, Height: 212}
	if got.Window != want {
		t.Fatalf("window=%+v want DPI-scaled %+v", got.Window, want)
	}
}

func TestResolveOverlayGeometryEditAndLowLevelsUseWholeMonitor(t *testing.T) {
	doc := geometryDocument(enabledWidget(100, 100, 100, 100))
	monitor := window.WailsRect{Width: 1920, Height: 1080}
	for _, level := range []int{1, 2} {
		if got := window.ResolveOverlayGeometry(doc, monitor, level, 16).Window; got != monitor {
			t.Fatalf("level %d window=%+v want monitor", level, got)
		}
	}
	doc.DisplayMode = config.ModeEdit
	if got := window.ResolveOverlayGeometry(doc, monitor, 5, 16).Window; got != monitor {
		t.Fatalf("edit window=%+v want monitor", got)
	}
}
