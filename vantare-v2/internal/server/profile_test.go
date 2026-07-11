package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/server"
	"github.com/vantare/overlays/v2/pkg/config"
)

func TestProfileV3MissingParam(t *testing.T) {
	dir := t.TempDir()
	srv := server.New(server.ServerConfig{CfgDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/profile-v3", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("missing profile param = %d, want 400", rr.Code)
	}
}

func TestProfileV3RejectsPathTraversal(t *testing.T) {
	dir := t.TempDir()
	srv := server.New(server.ServerConfig{CfgDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/profile-v3?profile=..%2Fsecret.json", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("path traversal = %d, want 400", rr.Code)
	}
	if body := rr.Body.String(); containsPath(body) {
		t.Fatalf("response leaked filesystem path: %s", body)
	}
}

func TestProfileV3NotFound(t *testing.T) {
	dir := t.TempDir()
	srv := server.New(server.ServerConfig{CfgDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/profile-v3?profile=missing.json", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("missing profile = %d, want 404", rr.Code)
	}
}

func TestProfileV3SuccessFromFixtures(t *testing.T) {
	fixtures := []struct {
		name   string
		source string
	}{
		{name: "v0", source: filepath.Join("..", "..", "pkg", "config", "testdata", "profile-v0-core-widgets.json")},
		{name: "v2", source: filepath.Join("..", "..", "pkg", "config", "testdata", "profile-v2-core-widgets.json")},
		{name: "v3", source: filepath.Join("..", "..", "pkg", "config", "testdata", "profile-v3-core-widgets-from-v2.golden.json")},
	}

	for _, fixture := range fixtures {
		t.Run(fixture.name, func(t *testing.T) {
			dir := t.TempDir()
			target := filepath.Join(dir, fixture.name+".json")
			copyFixture(t, fixture.source, target)

			srv := server.New(server.ServerConfig{CfgDir: dir})
			req := httptest.NewRequest(http.MethodGet, "/api/profile-v3?profile="+fixture.name+".json", nil)
			rr := httptest.NewRecorder()
			srv.Handler().ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Fatalf("GET /api/profile-v3 = %d, want 200: %s", rr.Code, rr.Body.String())
			}

			var resp struct {
				Document     *config.ProfileDocumentV3 `json:"document"`
				Revision     string                    `json:"revision"`
				LayoutOrigin config.Rect               `json:"layoutOrigin"`
			}
			if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if resp.Document == nil || resp.Document.SchemaVersion != config.ProfileSchemaVersionV3 {
				t.Fatalf("schemaVersion=%v want %d", resp.Document, config.ProfileSchemaVersionV3)
			}
			if resp.Revision == "" {
				t.Fatal("revision is empty")
			}
			if resp.LayoutOrigin.X < 0 || resp.LayoutOrigin.Y < 0 {
				t.Fatalf("layoutOrigin=(%d,%d) invalid", resp.LayoutOrigin.X, resp.LayoutOrigin.Y)
			}
		})
	}
}

func TestProfileV3EmptyProfile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "empty.json")
	store := config.ProfileDocumentStore{}
	doc := &config.ProfileDocumentV3{
		SchemaVersion: config.ProfileSchemaVersionV3,
		ID:            "empty",
		Name:          "Empty",
		DisplayMode:   config.ModeRacing,
		MonitorIndex:  0,
		Layouts: map[config.LayoutType]config.SessionLayoutV3{
			config.LayoutGeneral: {Type: config.LayoutGeneral, Widgets: nil},
		},
	}
	if _, err := store.Save(path, "", doc, config.ProfileSchemaVersionV3); err != nil {
		t.Fatal(err)
	}

	srv := server.New(server.ServerConfig{CfgDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/profile-v3?profile=empty.json", nil)
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("GET /api/profile-v3 = %d, want 200: %s", rr.Code, rr.Body.String())
	}

	var resp struct {
		LayoutOrigin config.Rect `json:"layoutOrigin"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.LayoutOrigin.X != 0 || resp.LayoutOrigin.Y != 0 {
		t.Fatalf("layoutOrigin=(%d,%d), want (0,0)", resp.LayoutOrigin.X, resp.LayoutOrigin.Y)
	}
}

func TestProfileV3InvalidProfile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "invalid.json")
	if err := os.WriteFile(path, []byte(`{"schemaVersion":3,"id":"","name":""}`), 0644); err != nil {
		t.Fatal(err)
	}

	srv := server.New(server.ServerConfig{CfgDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/profile-v3?profile=invalid.json", nil)
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("invalid profile = %d, want 400: %s", rr.Code, rr.Body.String())
	}
	if body := rr.Body.String(); containsPath(body) {
		t.Fatalf("response leaked filesystem path: %s", body)
	}
}

func copyFixture(t *testing.T, source, target string) {
	t.Helper()
	data, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, data, 0644); err != nil {
		t.Fatal(err)
	}
}

func containsPath(body string) bool {
	return filepath.IsAbs(body) || containsAny(body, ":\\", "/Users/", "C:\\")
}

func containsAny(value, a, b, c string) bool {
	return (a != "" && len(value) > 0 && findSubstr(value, a)) ||
		(b != "" && findSubstr(value, b)) ||
		(c != "" && findSubstr(value, c))
}

func findSubstr(value, needle string) bool {
	for i := 0; i+len(needle) <= len(value); i++ {
		if value[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
