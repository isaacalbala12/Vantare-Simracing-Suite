package server

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/calendar"
	engineerservice "github.com/vantare/overlays/v2/internal/engineer/service"
)

type authAttempt struct {
	provider  string
	state     string
	createdAt time.Time
}

// authAttemptStore binds a provider and a high-entropy state to a login that
// the desktop app initiated before opening the external browser. Attempts are
// short-lived and consumed atomically by /auth/token.
type authAttemptStore struct {
	mu       sync.Mutex
	attempts map[string]authAttempt
	ttl      time.Duration
}

func newAuthAttemptStore() *authAttemptStore {
	return &authAttemptStore{attempts: make(map[string]authAttempt), ttl: 5 * time.Minute}
}

func randomHex(size int) (string, error) {
	b := make([]byte, size)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate cryptographic random value: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func (s *authAttemptStore) Create(provider string) (string, string, error) {
	id, err := randomHex(16)
	if err != nil {
		return "", "", err
	}
	state, err := randomHex(32)
	if err != nil {
		return "", "", err
	}
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, attempt := range s.attempts {
		if now.Sub(attempt.createdAt) > s.ttl {
			delete(s.attempts, key)
		}
	}
	s.attempts[id] = authAttempt{provider: provider, state: state, createdAt: now}
	return id, state, nil
}

func (s *authAttemptStore) matches(id, provider, state string, consume bool) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	attempt, ok := s.attempts[id]
	if !ok || time.Since(attempt.createdAt) > s.ttl {
		delete(s.attempts, id)
		return false
	}
	stateMatches := subtle.ConstantTimeCompare([]byte(attempt.state), []byte(state)) == 1
	if attempt.provider != provider || !stateMatches {
		return false
	}
	if consume {
		delete(s.attempts, id)
	}
	return true
}

func (s *authAttemptStore) Validate(id, provider, state string) bool {
	return s.matches(id, provider, state, false)
}

func (s *authAttemptStore) Consume(id, provider, state string) bool {
	return s.matches(id, provider, state, true)
}

// rateLimiter is a simple in-memory sliding-window rate limiter.
type rateLimiter struct {
	mu        sync.Mutex
	counts    map[string]int
	window    time.Duration
	max       int
	lastClean time.Time
}

func newRateLimiter(max int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		counts:    make(map[string]int),
		window:    window,
		max:       max,
		lastClean: time.Now(),
	}
}

func (rl *rateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	if now.Sub(rl.lastClean) > rl.window {
		rl.counts = make(map[string]int)
		rl.lastClean = now
	}
	c := rl.counts[key]
	if c >= rl.max {
		return false
	}
	rl.counts[key] = c + 1
	return true
}

// clientIP extracts the IP address from an http.Request RemoteAddr, stripping
// the ephemeral port so rate limiting works by client IP, not by (IP, port).
func clientIP(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}
	return host
}

// ValidateAddr rejects addresses that bind to non-loopback interfaces.
func ValidateAddr(addr string) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("invalid address %q: %w", addr, err)
	}
	if host == "" {
		return fmt.Errorf("address %q exposes the server to external connections; use 127.0.0.1, localhost, or [::1]", addr)
	}
	if host == "localhost" {
		return nil
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return fmt.Errorf("address %q has an unparseable host %q; use 127.0.0.1, localhost, or [::1]", addr, host)
	}
	if ip.IsLoopback() {
		return nil
	}
	return fmt.Errorf("address %q exposes the server to external connections; use 127.0.0.1, localhost, or [::1]", addr)
}

// securityHeaders wraps an http.Handler to emit basic security headers on every
// response. Route-specific handlers may set additional headers (e.g. Cache-Control).
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		// 'self' es imprescindible: la pagina /overlay (OBS browser source)
		// carga el bundle y estilos del propio servidor (/assets/*); sin
		// 'self' cualquier navegador conforme bloquea el SPA y el overlay
		// queda en blanco fuera de la WebView de la app (ISA-372/F6).
		w.Header().Set("Content-Security-Policy",
			"default-src 'none'; script-src 'self' 'unsafe-inline'; "+
				"connect-src 'self' http://127.0.0.1:39261 http://localhost:39261; "+
				"style-src 'self' 'unsafe-inline'; img-src 'self' data:; "+
				"font-src 'self'; base-uri 'none'; form-action 'none'")
		next.ServeHTTP(w, r)
	})
}

// EventEmitter is the subset of app.EventEmitter used by the server to forward
// OAuth tokens to the Wails frontend.
type EventEmitter interface {
	Emit(name string, data any)
}

type Server struct {
	mux          *http.ServeMux
	srv          *http.Server
	engineerSvc  *engineerservice.EngineerService
	distFS       fs.FS
	cfgDir       string
	emitter      EventEmitter
	authAttempts *authAttemptStore
	rateLimiter  *rateLimiter
	addr         string
}

type ServerConfig struct {
	Addr                    string
	DistFS                  fs.FS
	CfgDir                  string
	EngineerSvc             *engineerservice.EngineerService
	Emitter                 EventEmitter
	StrategyProjection      *telemetrytransport.Hub
	StrategyPublicTransport bool
	OverlayV2Publishers     *telemetrytransport.PublisherRegistry
}

func New(cfg ServerConfig) *Server {
	mux := http.NewServeMux()
	s := &Server{
		mux:          mux,
		engineerSvc:  cfg.EngineerSvc,
		distFS:       cfg.DistFS,
		cfgDir:       cfg.CfgDir,
		emitter:      cfg.Emitter,
		authAttempts: newAuthAttemptStore(),
		rateLimiter:  newRateLimiter(10, 1*time.Minute),
		addr:         cfg.Addr,
	}

	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /overlay", s.handleOverlay)
	mux.HandleFunc("GET /api/profile", s.handleProfile)
	mux.HandleFunc("GET /api/profile-v3", s.handleProfileV3)
	mux.HandleFunc("GET /api/calendar", s.handleCalendar)
	mux.HandleFunc("GET /api/engineer/health", s.handleEngineerHealth)
	if cfg.StrategyPublicTransport && cfg.StrategyProjection != nil {
		mux.Handle(
			"GET "+telemetrytransport.ProjectionRoute(telemetrytransport.ProductStrategy),
			telemetrytransport.SSEHandler(cfg.StrategyProjection),
		)
	}
	if cfg.OverlayV2Publishers != nil {
		mux.Handle(
			"GET "+telemetrytransport.PublisherProjectionRoute(telemetrytransport.ProductOverlayV2),
			telemetrytransport.PublisherSSEHandler(cfg.OverlayV2Publishers, telemetrytransport.ProductOverlayV2),
		)
	}
	mux.HandleFunc("GET /engineer/stream", s.handleEngineerSSE)
	mux.HandleFunc("GET /auth/callback", s.handleAuthCallback)
	mux.HandleFunc("POST /auth/token", s.handleAuthToken)
	if cfg.DistFS != nil {
		mux.Handle("GET /assets/", securityHeaders(http.FileServerFS(cfg.DistFS)))
		mux.Handle("GET /favicon.svg", securityHeaders(http.FileServerFS(cfg.DistFS)))
	}

	if cfg.Addr != "" {
		s.srv = &http.Server{
			Addr:    cfg.Addr,
			Handler: securityHeaders(mux),
		}
	}

	return s
}

func (s *Server) handleCalendar(w http.ResponseWriter, _ *http.Request) {
	service := calendar.NewService(s.cfgDir, time.Now)
	if err := service.Load(); err != nil {
		http.Error(w, "calendar unavailable", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(service.Calendar()); err != nil {
		log.Printf("calendar response: %v", err)
	}
}

func (s *Server) Handler() http.Handler {
	return securityHeaders(s.mux)
}

// Addr returns the actual bound address, or "" if the server has not started.
func (s *Server) Addr() string {
	if s.srv == nil {
		return ""
	}
	return s.srv.Addr
}

func (s *Server) Start() {
	if s.srv == nil {
		log.Println("HTTP server: no address configured, skipping")
		return
	}
	if s.srv.Addr == "" {
		log.Println("HTTP server: empty address configured, skipping")
		return
	}
	listener, err := net.Listen("tcp", s.srv.Addr)
	if err != nil {
		log.Printf("HTTP server: FAILED to listen on %s: %v", s.srv.Addr, err)
		return
	}
	// Update Addr to the actual bound address (important when port 0 or dynamic)
	s.srv.Addr = listener.Addr().String()
	log.Printf("HTTP server: listening on %s", s.srv.Addr)
	go func() {
		if err := s.srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP server: serve error on %s: %v", s.srv.Addr, err)
		}
	}()
}

func (s *Server) Stop() error {
	if s.srv == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return s.srv.Shutdown(ctx)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func (s *Server) handleOverlay(w http.ResponseWriter, r *http.Request) {
	if s.distFS == nil {
		http.Error(w, "frontend dist not available", http.StatusInternalServerError)
		return
	}
	data, err := fs.ReadFile(s.distFS, "overlay.html")
	if err != nil {
		http.Error(w, "overlay.html not found", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(data)
}

// handleEngineerHealth exposes a lightweight Engineer service snapshot for
// OBS/release diagnostics. It returns 503 when the service is unavailable or
// reports an unhealthy state.
func (s *Server) handleEngineerHealth(w http.ResponseWriter, r *http.Request) {
	if s.engineerSvc == nil {
		http.Error(w, "engineer service not available", http.StatusServiceUnavailable)
		return
	}
	h := s.engineerSvc.Health()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache")
	if !h.OK {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	json.NewEncoder(w).Encode(h)
}

// authCallbackHTMLTmpl is only served for a valid app-created OAuth attempt.
// Supabase returns tokens in the URL fragment; the page posts them back with
// the exact attempt tuple, which /auth/token consumes atomically.
const authCallbackHTMLTmpl = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vantare — Inicio de sesión</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
         background: #0a0a0a; color: #e0e0e0; display: flex;
         align-items: center; justify-content: center; min-height: 100vh; }
  .card { text-align: center; max-width: 400px; padding: 2rem; }
  .logo { font-size: 1.1rem; font-weight: 700; letter-spacing: .15em;
          text-transform: uppercase; color: #fff; margin-bottom: 1.5rem; }
  .status { font-size: .85rem; color: #999; margin-bottom: 1rem; }
  .ok { color: #34d399; }
  .err { color: #e63946; }
  .hint { font-size: .75rem; color: #666; margin-top: 1rem; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">Vantare</div>
  <p id="msg" class="status">Finalizando inicio de sesión…</p>
  <p id="hint" class="hint"></p>
</div>
<script>
(function() {
  var msg = document.getElementById('msg');
  var hint = document.getElementById('hint');
  var AUTH_ATTEMPT = '%s';
  var AUTH_PROVIDER = '%s';
  var AUTH_STATE = '%s';
  var hash = window.location.hash.substring(1);
  var params = new URLSearchParams(hash);
  var token = params.get('access_token');
  var refresh = params.get('refresh_token');
  if (!token) {
    var search = window.location.search;
    token = new URLSearchParams(search).get('access_token');
    refresh = new URLSearchParams(search).get('refresh_token');
  }
  if (!token) {
    msg.textContent = 'No se recibió token de autenticación.';
    msg.classList.add('err');
    hint.textContent = 'Vuelve a la app Vantare e intenta de nuevo.';
    return;
  }
  var body = {
    access_token: token,
    attempt_id: AUTH_ATTEMPT,
    provider: AUTH_PROVIDER,
    state: AUTH_STATE
  };
  if (refresh) { body.refresh_token = refresh; }
  fetch('/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function(res) {
    if (res.ok) {
      msg.textContent = '¡Sesión iniciada correctamente!';
      msg.classList.add('ok');
      hint.textContent = 'Puedes cerrar esta pestaña y volver a Vantare.';
    } else {
      msg.textContent = 'Error al enviar el token a la app.';
      msg.classList.add('err');
      hint.textContent = 'Vuelve a la app Vantare e intenta de nuevo.';
    }
  }).catch(function() {
    msg.textContent = 'No se pudo conectar con la app Vantare.';
    msg.classList.add('err');
    hint.textContent = 'Asegúrate de que Vantare está abierta e intenta de nuevo.';
  });
})();
</script>
</body>
</html>`

func (s *Server) handleAuthCallback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	attemptID := r.URL.Query().Get("attempt")
	provider := r.URL.Query().Get("provider")
	state := r.URL.Query().Get("state")
	if !s.authAttempts.Validate(attemptID, provider, state) {
		http.Error(w, "invalid or expired authentication attempt", http.StatusUnauthorized)
		return
	}
	html := fmt.Sprintf(authCallbackHTMLTmpl, attemptID, provider, state)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(html))
}

type authTokenPayload struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	AttemptID    string `json:"attempt_id"`
	Provider     string `json:"provider"`
	State        string `json:"state"`
}

func (s *Server) handleAuthToken(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")

	if s.emitter == nil {
		http.Error(w, "emitter not configured", http.StatusInternalServerError)
		return
	}

	// Rate limit by client IP (without ephemeral port).
	if !s.rateLimiter.Allow(clientIP(r.RemoteAddr)) {
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<16)) // 64 KiB max
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var payload authTokenPayload
	if err := json.Unmarshal(body, &payload); err != nil || payload.AccessToken == "" {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if !s.authAttempts.Consume(payload.AttemptID, payload.Provider, payload.State) {
		http.Error(w, "invalid or expired authentication attempt", http.StatusUnauthorized)
		return
	}

	log.Printf("auth: received OAuth token via local callback, hydrating session and forwarding to license validation")
	if payload.RefreshToken != "" {
		s.emitter.Emit("auth:session", map[string]any{
			"access_token":  payload.AccessToken,
			"refresh_token": payload.RefreshToken,
			"source":        "callback",
		})
	}
	s.emitter.Emit("license:validate", map[string]any{
		"sessionToken": payload.AccessToken,
		"refreshToken": payload.RefreshToken,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

type AuthAttempt struct {
	ID          string `json:"attemptId"`
	Provider    string `json:"provider"`
	State       string `json:"state"`
	RedirectURL string `json:"redirectUrl"`
}

// CreateAuthAttempt must be called by the desktop UI before opening a browser.
// Only supported providers are accepted and the resulting callback is bound to
// this exact attempt, provider and state.
func (s *Server) CreateAuthAttempt(provider string) (AuthAttempt, error) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider != "google" && provider != "discord" {
		return AuthAttempt{}, fmt.Errorf("unsupported OAuth provider %q", provider)
	}
	id, state, err := s.authAttempts.Create(provider)
	if err != nil {
		return AuthAttempt{}, err
	}
	addr := s.addr
	if addr == "" {
		addr = "127.0.0.1:39261"
	}
	callback := url.URL{Scheme: "http", Host: addr, Path: "/auth/callback"}
	query := callback.Query()
	query.Set("attempt", id)
	query.Set("provider", provider)
	query.Set("state", state)
	callback.RawQuery = query.Encode()
	return AuthAttempt{ID: id, Provider: provider, State: state, RedirectURL: callback.String()}, nil
}
