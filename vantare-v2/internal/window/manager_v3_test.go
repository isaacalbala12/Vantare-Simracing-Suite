package window_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/window"
	"github.com/vantare/overlays/v2/pkg/config"
)

type v3ModeWindow struct {
	ignoreMouse bool
	resizable   bool
	fullscreen  bool
	position    struct{ x, y int }
	size        struct{ w, h int }
}

func (w *v3ModeWindow) SetBounds(bounds window.WailsRect) {}
func (w *v3ModeWindow) SetSize(width, height int) {
	w.size.w = width
	w.size.h = height
}
func (w *v3ModeWindow) SetPosition(x, y int) {
	w.position.x = x
	w.position.y = y
}
func (w *v3ModeWindow) SetIgnoreMouseEvents(ignore bool) { w.ignoreMouse = ignore }
func (w *v3ModeWindow) SetResizable(b bool)              { w.resizable = b }
func (w *v3ModeWindow) Fullscreen()                      { w.fullscreen = true }
func (w *v3ModeWindow) UnFullscreen()                    { w.fullscreen = false }

func racingDocument() *config.ProfileDocumentV3 {
	return &config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            "racing",
		Name:          "Racing",
		DisplayMode:   config.ModeRacing,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral},
		},
	}
}

func TestManagerApplyProfileV3RacingFullscreen(t *testing.T) {
	win := &v3ModeWindow{}
	mgr := window.NewManager(win, 0)
	mgr.ApplyProfileV3(racingDocument(), false)
	if !win.fullscreen || !win.ignoreMouse || win.resizable {
		t.Fatalf("racing mode window state incorrect: %+v", win)
	}
}

func TestManagerApplyProfileV3StreamingHidesWindow(t *testing.T) {
	win := &v3ModeWindow{}
	mgr := window.NewManager(win, 0)
	doc := racingDocument()
	doc.DisplayMode = config.ModeStreaming
	mgr.ApplyProfileV3(doc, false)
	if win.position.x != -9999 || win.position.y != -9999 || win.size.w != 1 || win.size.h != 1 {
		t.Fatalf("streaming mode should hide window: %+v", win)
	}
}

func TestManagerLayoutOriginV3FullscreenZero(t *testing.T) {
	mgr := window.NewManager(&v3ModeWindow{}, 8)
	origin := mgr.LayoutOriginV3(racingDocument())
	if origin.X != 0 || origin.Y != 0 {
		t.Fatalf("origin=(%d,%d), want (0,0)", origin.X, origin.Y)
	}
}
