package server_test

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

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

// nonceReq creates a POST /auth/token request with a valid nonce injected into
// the given JSON body. The body should omit the "nonce" field; it is appended.
func nonceReq(srv *server.Server, body string) *http.Request {
	nonce := srv.GenerateNonce()
	// Insert nonce into the JSON body by trimming the closing brace.
	body = strings.TrimRight(body, " \t\r\n}") + `, "nonce":"` + nonce + `"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/token", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req
}

// testEmitter records Emit calls for verification.
type testEmitter struct {
	calls []emitCall
}

type emitCall struct {
	name string
	data any
}

func (e *testEmitter) Emit(name string, data any) {
	e.calls = append(e.calls, emitCall{name: name, data: data})
}

func TestAuthCallbackServesHTML(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/auth/callback", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("GET /auth/callback = %d, want 200", rr.Code)
	}
	ct := rr.Header().Get("Content-Type")
	if ct != "text/html; charset=utf-8" {
		t.Fatalf("Content-Type = %s, want text/html", ct)
	}
	body := rr.Body.String()
	if !strings.Contains(body, "Vantare") {
		t.Fatal("callback HTML should contain Vantare branding")
	}
	if !strings.Contains(body, "/auth/token") {
		t.Fatal("callback HTML should POST to /auth/token")
	}
	if !strings.Contains(body, "refresh_token") {
		t.Fatal("callback HTML should extract refresh_token from URL fragment")
	}
	if !strings.Contains(body, "access_token") {
		t.Fatal("callback HTML should extract access_token from URL fragment")
	}
	if !strings.Contains(body, "AUTH_NONCE") {
		t.Fatal("callback HTML should contain nonce placeholder")
	}
	if !strings.Contains(body, "nonce: AUTH_NONCE") {
		t.Fatal("callback HTML should send nonce in POST body")
	}
	if rr.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("callback should have Cache-Control: no-store")
	}
}

func TestAuthTokenForwardsToEmitter(t *testing.T) {
	em := &testEmitter{}
	srv := server.New(server.ServerConfig{Emitter: em})
	req := nonceReq(srv, `{"access_token":"test-tok-123"}`)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("POST /auth/token = %d, want 200: %s", rr.Code, rr.Body.String())
	}
	if len(em.calls) != 1 {
		t.Fatalf("expected 1 emit call, got %d", len(em.calls))
	}
	if em.calls[0].name != "license:validate" {
		t.Fatalf("emit name = %s, want license:validate", em.calls[0].name)
	}
	dataMap, ok := em.calls[0].data.(map[string]any)
	if !ok {
		t.Fatalf("emit data type = %T, want map[string]any", em.calls[0].data)
	}
	if dataMap["sessionToken"] != "test-tok-123" {
		t.Fatalf("sessionToken = %v, want test-tok-123", dataMap["sessionToken"])
	}
}

func TestAuthTokenForwardsRefreshToken(t *testing.T) {
	em := &testEmitter{}
	srv := server.New(server.ServerConfig{Emitter: em})
	req := nonceReq(srv, `{"access_token":"tok","refresh_token":"ref-456"}`)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("POST /auth/token = %d, want 200: %s", rr.Code, rr.Body.String())
	}
	if len(em.calls) != 1 {
		t.Fatalf("expected 1 emit call, got %d", len(em.calls))
	}
	dataMap, ok := em.calls[0].data.(map[string]any)
	if !ok {
		t.Fatalf("emit data type = %T, want map[string]any", em.calls[0].data)
	}
	if dataMap["sessionToken"] != "tok" {
		t.Fatalf("sessionToken = %v, want tok", dataMap["sessionToken"])
	}
	if dataMap["refreshToken"] != "ref-456" {
		t.Fatalf("refreshToken = %v, want ref-456", dataMap["refreshToken"])
	}
}

func TestAuthTokenAcceptsMissingRefreshToken(t *testing.T) {
	em := &testEmitter{}
	srv := server.New(server.ServerConfig{Emitter: em})
	req := nonceReq(srv, `{"access_token":"tok-only"}`)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("POST /auth/token = %d, want 200: %s", rr.Code, rr.Body.String())
	}
	if len(em.calls) != 1 {
		t.Fatalf("expected 1 emit call, got %d", len(em.calls))
	}
	dataMap, ok := em.calls[0].data.(map[string]any)
	if !ok {
		t.Fatalf("emit data type = %T, want map[string]any", em.calls[0].data)
	}
	if dataMap["sessionToken"] != "tok-only" {
		t.Fatalf("sessionToken = %v, want tok-only", dataMap["sessionToken"])
	}
	// refreshToken should be empty string (zero value), not cause a panic
	if _, exists := dataMap["refreshToken"]; !exists {
		t.Fatal("refreshToken key should exist in emit data")
	}
}

func TestAuthTokenRejectsEmptyToken(t *testing.T) {
	em := &testEmitter{}
	srv := server.New(server.ServerConfig{Emitter: em})
	req := nonceReq(srv, `{"access_token":""}`)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("POST /auth/token empty = %d, want 400", rr.Code)
	}
	if len(em.calls) != 0 {
		t.Fatalf("expected 0 emit calls for empty token, got %d", len(em.calls))
	}
}

func TestAuthTokenRejectsNoEmitter(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := nonceReq(srv, `{"access_token":"tok"}`)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("POST /auth/token no emitter = %d, want 500", rr.Code)
	}
}

func TestAuthTokenRejectsMissingNonce(t *testing.T) {
	em := &testEmitter{}
	srv := server.New(server.ServerConfig{Emitter: em})
	payload := `{"access_token":"tok","nonce":""}`
	req := httptest.NewRequest(http.MethodPost, "/auth/token", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("POST /auth/token missing nonce = %d, want 401", rr.Code)
	}
	if len(em.calls) != 0 {
		t.Fatal("expected 0 emit calls for missing nonce")
	}
}

func TestAuthTokenRejectsInvalidNonce(t *testing.T) {
	em := &testEmitter{}
	srv := server.New(server.ServerConfig{Emitter: em})
	payload := `{"access_token":"tok","nonce":"bogus-nonce"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/token", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("POST /auth/token invalid nonce = %d, want 401", rr.Code)
	}
	if len(em.calls) != 0 {
		t.Fatal("expected 0 emit calls for invalid nonce")
	}
}

func TestAuthTokenRejectsReusedNonce(t *testing.T) {
	em := &testEmitter{}
	srv := server.New(server.ServerConfig{Emitter: em})

	// Generate a nonce manually and use it in the first request.
	nonce := srv.GenerateNonce()
	body1 := `{"access_token":"tok","nonce":"` + nonce + `"}`
	req1 := httptest.NewRequest(http.MethodPost, "/auth/token", strings.NewReader(body1))
	req1.Header.Set("Content-Type", "application/json")
	rr1 := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusOK {
		t.Fatalf("first request with valid nonce = %d, want 200", rr1.Code)
	}

	// Second request reusing the same nonce should fail.
	req2 := httptest.NewRequest(http.MethodPost, "/auth/token", strings.NewReader(body1))
	req2.Header.Set("Content-Type", "application/json")
	rr2 := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr2, req2)

	if rr2.Code != http.StatusUnauthorized {
		t.Fatalf("reused nonce = %d, want 401", rr2.Code)
	}
	if len(em.calls) != 1 {
		t.Fatalf("expected 1 emit call, got %d", len(em.calls))
	}
}

func TestAuthTokenRateLimited(t *testing.T) {
	em := &testEmitter{}
	srv := server.New(server.ServerConfig{Emitter: em})

	// Generate nonces and send concurrent requests to exhaust the limit.
	// The default rate limiter allows 10 per minute per IP.
	for i := 0; i < 10; i++ {
		req := nonceReq(srv, `{"access_token":"tok"}`)
		rr := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rr, req)
		if rr.Code != http.StatusOK && rr.Code != http.StatusTooManyRequests {
			t.Fatalf("iteration %d: unexpected status %d", i, rr.Code)
		}
	}

	// The next request should be rate-limited.
	req := nonceReq(srv, `{"access_token":"tok"}`)
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("rate-limited request = %d, want 429", rr.Code)
	}
}

func TestAuthTokenRateLimitSharesCounterByIP(t *testing.T) {
	em := &testEmitter{}
	srv := server.New(server.ServerConfig{Emitter: em})

	// 10 requests from same IP with different ports should share the counter.
	for i := 0; i < 10; i++ {
		req := nonceReq(srv, `{"access_token":"tok"}`)
		port := 50000 + i
		req.RemoteAddr = fmt.Sprintf("127.0.0.1:%d", port)
		rr := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rr, req)
		if rr.Code != http.StatusOK && rr.Code != http.StatusTooManyRequests {
			t.Fatalf("iteration %d: unexpected status %d", i, rr.Code)
		}
	}

	// 11th request from same IP should be rate-limited.
	req := nonceReq(srv, `{"access_token":"tok"}`)
	req.RemoteAddr = "127.0.0.1:51000"
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("rate-limited request from same IP = %d, want 429", rr.Code)
	}
}

func TestAuthTokenRateLimitDifferentIPsDontShare(t *testing.T) {
	em := &testEmitter{}
	srv := server.New(server.ServerConfig{Emitter: em})

	// 10 requests from IP A exhaust the limit for A.
	for i := 0; i < 10; i++ {
		req := nonceReq(srv, `{"access_token":"tok"}`)
		req.RemoteAddr = fmt.Sprintf("10.0.0.1:%d", 50000+i)
		rr := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rr, req)
		if rr.Code != http.StatusOK && rr.Code != http.StatusTooManyRequests {
			t.Fatalf("iteration %d: unexpected status %d", i, rr.Code)
		}
	}

	// Request from IP B should still be allowed (different counter).
	req := nonceReq(srv, `{"access_token":"tok"}`)
	req.RemoteAddr = "10.0.0.2:39261"
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("request from different IP = %d, want 200", rr.Code)
	}
}

func TestValidateAddrAccepts127_0_0_1(t *testing.T) {
	err := server.ValidateAddr("127.0.0.1:39261")
	if err != nil {
		t.Fatalf("ValidateAddr(127.0.0.1:39261) = %v, want nil", err)
	}
}

func TestValidateAddrAcceptsLocalhost(t *testing.T) {
	err := server.ValidateAddr("localhost:39261")
	if err != nil {
		t.Fatalf("ValidateAddr(localhost:39261) = %v, want nil", err)
	}
}

func TestValidateAddrAcceptsIPv6Loopback(t *testing.T) {
	err := server.ValidateAddr("[::1]:39261")
	if err != nil {
		t.Fatalf("ValidateAddr([::1]:39261) = %v, want nil", err)
	}
}

func TestValidateAddrRejects0_0_0_0(t *testing.T) {
	err := server.ValidateAddr("0.0.0.0:39261")
	if err == nil {
		t.Fatal("ValidateAddr(0.0.0.0:39261) should return an error")
	}
}

func TestValidateAddrRejectsIPv6Unspecified(t *testing.T) {
	err := server.ValidateAddr("[::]:39261")
	if err == nil {
		t.Fatal("ValidateAddr([::]:39261) should return an error")
	}
}

func TestValidateAddrRejectsEmptyHost(t *testing.T) {
	err := server.ValidateAddr(":39261")
	if err == nil {
		t.Fatal("ValidateAddr(:39261) should return an error")
	}
}

func TestValidateAddrRejectsLAN_192_168(t *testing.T) {
	err := server.ValidateAddr("192.168.1.10:39261")
	if err == nil {
		t.Fatal("ValidateAddr(192.168.1.10:39261) should return an error")
	}
}

func TestValidateAddrRejectsLAN_10_0_0(t *testing.T) {
	err := server.ValidateAddr("10.0.0.2:39261")
	if err == nil {
		t.Fatal("ValidateAddr(10.0.0.2:39261) should return an error")
	}
}

func TestValidateAddrRejectsLAN_172_20(t *testing.T) {
	err := server.ValidateAddr("172.20.0.2:39261")
	if err == nil {
		t.Fatal("ValidateAddr(172.20.0.2:39261) should return an error")
	}
}

func TestSecurityHeadersPresent(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("response missing X-Content-Type-Options: nosniff")
	}
	if rr.Header().Get("Referrer-Policy") != "no-referrer" {
		t.Fatal("response missing Referrer-Policy: no-referrer")
	}
}

func TestSecurityHeadersCSP(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	csp := rr.Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Fatal("response missing Content-Security-Policy")
	}
	if !strings.Contains(csp, "default-src 'none'") {
		t.Fatal("CSP should include default-src 'none'")
	}
	if !strings.Contains(csp, "script-src 'unsafe-inline'") {
		t.Fatal("CSP should include script-src 'unsafe-inline'")
	}
	if !strings.Contains(csp, "base-uri 'none'") {
		t.Fatal("CSP should include base-uri 'none'")
	}
	if !strings.Contains(csp, "form-action 'none'") {
		t.Fatal("CSP should include form-action 'none'")
	}
}

func TestAuthCallbackSecurityHeaders(t *testing.T) {
	srv := server.New(server.ServerConfig{})
	req := httptest.NewRequest(http.MethodGet, "/auth/callback", nil)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("callback missing X-Content-Type-Options: nosniff")
	}
	if rr.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("callback missing Cache-Control: no-store")
	}
}

func TestAuthTokenSecurityHeaders(t *testing.T) {
	srv := server.New(server.ServerConfig{Emitter: &testEmitter{}})
	req := nonceReq(srv, `{"access_token":"tok"}`)
	rr := httptest.NewRecorder()

	srv.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("POST /auth/token = %d, want 200", rr.Code)
	}
	if rr.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("token response missing X-Content-Type-Options: nosniff")
	}
	if rr.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("token response missing Cache-Control: no-store")
	}
}

func TestServerStartAndHealth(t *testing.T) {
	srv := server.New(server.ServerConfig{Addr: "127.0.0.1:0"})
	srv.Start()
	if srv.Addr() == "" || srv.Addr() == "127.0.0.1:0" {
		t.Fatalf("Start() should bind to a real port, got %q", srv.Addr())
	}
	healthURL := "http://" + srv.Addr() + "/health"
	resp, err := http.Get(healthURL)
	if err != nil {
		t.Fatalf("GET %s: %v", healthURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /health = %d, want 200", resp.StatusCode)
	}
	var body map[string]bool
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode health body: %v", err)
	}
	if !body["ok"] {
		t.Fatal("GET /health: ok=false")
	}
	if err := srv.Stop(); err != nil {
		t.Fatalf("Stop(): %v", err)
	}
}

func TestServerStartPortInUse(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()

	srv := server.New(server.ServerConfig{Addr: l.Addr().String()})
	srv.Start()
	// After a failed Start(), the server should not respond.
	// Use a short timeout so we don't hang on the test if something is wrong.
	client := &http.Client{Timeout: 500 * time.Millisecond}
	healthURL := "http://" + srv.Addr() + "/health"
	_, err = client.Get(healthURL)
	if err == nil {
		t.Fatalf("expected connection error for port-in-use, got a response")
	}
}
