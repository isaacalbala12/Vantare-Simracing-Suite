package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/internal/server"
	"github.com/vantare/overlays/v2/pkg/config"
)

func TestHealth(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("GET /health = %d, want %d", rr.Code, http.StatusOK)
	}
	var body map[string]bool
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !body["ok"] {
		t.Fatal("GET /health: ok=false")
	}
}

func TestHealthJSONEq(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("GET /health = %d, want %d", rr.Code, http.StatusOK)
	}
	want := `{"ok":true}`
	got := strings.TrimSpace(rr.Body.String())
	if got != want {
		t.Fatalf("GET /health body = %q, want %q", got, want)
	}
}

func TestOverlayNoDist(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/overlay?profile=test.json", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("GET /overlay without dist = %d, want 500", rr.Code)
	}
}

func TestProfileMissingParam(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("GET /api/profile without param = %d, want 400", rr.Code)
	}
}

func TestProfileRejectsPathTraversal(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/api/profile?profile=../../secret.json", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("path traversal = %d, want 400", rr.Code)
	}
}

func TestProfileNotFound(t *testing.T) {
	dir := t.TempDir()
	srv := server.New(server.ServerConfig{CfgDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/profile?profile=nonexistent.json", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("missing profile = %d, want 404", rr.Code)
	}
}

func TestProfileSuccess(t *testing.T) {
	dir := t.TempDir()
	profilePath := filepath.Join(dir, "test-profile.json")
	profile := config.ProfileConfig{
		ID:          "test",
		Name:        "Test",
		DisplayMode: config.ModeStreaming,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
		},
	}
	if err := config.SaveFile(profilePath, &profile); err != nil {
		t.Fatal(err)
	}

	srv := server.New(server.ServerConfig{CfgDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/profile?profile=test-profile.json", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("GET /api/profile = %d, want 200: %s", rr.Code, rr.Body.String())
	}

	var resp struct {
		Profile      *config.ProfileConfig `json:"profile"`
		LayoutOrigin config.Rect           `json:"layoutOrigin"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Profile == nil {
		t.Fatal("profile is nil")
	}
	if resp.Profile.DisplayMode != config.ModeStreaming {
		t.Fatalf("displayMode = %s, want streaming", resp.Profile.DisplayMode)
	}
	if resp.LayoutOrigin.X != 92 || resp.LayoutOrigin.Y != 192 {
		t.Fatalf("layoutOrigin=(%d,%d), want (92,192)", resp.LayoutOrigin.X, resp.LayoutOrigin.Y)
	}
}

func TestOverlayServesHTML(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html><body>OK</body></html>"), 0644); err != nil {
		t.Fatal(err)
	}
	distFS := os.DirFS(dir)
	srv := server.New(server.ServerConfig{DistFS: distFS})
	req := httptest.NewRequest(http.MethodGet, "/overlay?profile=test.json", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("GET /overlay = %d, want 200", rr.Code)
	}
	ct := rr.Header().Get("Content-Type")
	if ct != "text/html; charset=utf-8" {
		t.Fatalf("Content-Type = %s, want text/html", ct)
	}
}

func TestStaticAssetServedFromDist(t *testing.T) {
	dir := t.TempDir()
	assetsDir := filepath.Join(dir, "assets")
	if err := os.MkdirAll(assetsDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(assetsDir, "index-test.js"), []byte("console.log('ok')"), 0644); err != nil {
		t.Fatal(err)
	}
	distFS := os.DirFS(dir)
	srv := server.New(server.ServerConfig{DistFS: distFS})
	req := httptest.NewRequest(http.MethodGet, "/assets/index-test.js", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("GET /assets/index-test.js = %d, want 200: %s", rr.Code, rr.Body.String())
	}
	if got := strings.TrimSpace(rr.Body.String()); got != "console.log('ok')" {
		t.Fatalf("asset body = %q", got)
	}
}

func TestProfileResolvesByJSONIDWhenFilenameDiffers(t *testing.T) {
	dir := t.TempDir()
	profilePath := filepath.Join(dir, "example-streaming.json")
	profile := config.ProfileConfig{
		ID:          "default-streaming",
		Name:        "Streaming",
		DisplayMode: config.ModeStreaming,
		Widgets: []config.WidgetConfig{
			{ID: "delta", Type: "delta", Enabled: true, Position: config.Rect{X: 100, Y: 200, W: 400, H: 48}},
		},
	}
	if err := config.SaveFile(profilePath, &profile); err != nil {
		t.Fatal(err)
	}

	srv := server.New(server.ServerConfig{CfgDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/profile?profile=default-streaming", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("GET /api/profile by id = %d, want 200: %s", rr.Code, rr.Body.String())
	}
	var resp struct {
		Profile *config.ProfileConfig `json:"profile"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Profile == nil || resp.Profile.ID != "default-streaming" {
		t.Fatalf("profile id = %#v, want default-streaming", resp.Profile)
	}
}

func TestMethodNotAllowed(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodPost, "/health", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST /health = %d, want 405", rr.Code)
	}
}

func TestUnknownRoute(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/unknown", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("GET /unknown = %d, want 404", rr.Code)
	}
}

func TestProfileRejectsAbsolutePathWindows(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	abs := "C:\\Windows\\system32\\drivers\\etc\\hosts"
	req := httptest.NewRequest(http.MethodGet, "/api/profile?profile="+abs, nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("absolute path Windows = %d, want 400", rr.Code)
	}
}

func TestProfileRejectsAbsolutePathUnix(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	abs := "/etc/passwd"
	req := httptest.NewRequest(http.MethodGet, "/api/profile?profile="+abs, nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("absolute path unix = %d, want 400", rr.Code)
	}
}
