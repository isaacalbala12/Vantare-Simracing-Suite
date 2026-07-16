package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	engineerservice "github.com/vantare/overlays/v2/internal/engineer/service"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

// nonceStore tracks single-use nonces for /auth/token CSRF protection.
type nonceStore struct {
	mu      sync.Mutex
	nonces  map[string]bool
	created map[string]time.Time
	ttl     time.Duration
}

func newNonceStore() *nonceStore {
	return &nonceStore{
		nonces:  make(map[string]bool),
		created: make(map[string]time.Time),
		ttl:     5 * time.Minute,
	}
}

func (ns *nonceStore) Generate() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand: " + err.Error())
	}
	nonce := hex.EncodeToString(b)
	ns.mu.Lock()
	defer ns.mu.Unlock()
	ns.nonces[nonce] = false
	ns.created[nonce] = time.Now()
	for k, t := range ns.created {
		if time.Since(t) > ns.ttl {
			delete(ns.nonces, k)
			delete(ns.created, k)
		}
	}
	return nonce
}

func (ns *nonceStore) Consume(nonce string) bool {
	ns.mu.Lock()
	defer ns.mu.Unlock()
	used, exists := ns.nonces[nonce]
	created, hasCreatedAt := ns.created[nonce]
	if !exists || used || !hasCreatedAt || time.Since(created) > ns.ttl {
		delete(ns.nonces, nonce)
		delete(ns.created, nonce)
		return false
	}
	delete(ns.nonces, nonce)
	delete(ns.created, nonce)
	return true
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
		w.Header().Set("Content-Security-Policy",
			"default-src 'none'; script-src 'unsafe-inline'; "+
				"connect-src http://127.0.0.1:39261 http://localhost:39261; "+
				"style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
		next.ServeHTTP(w, r)
	})
}

// EventEmitter is the subset of app.EventEmitter used by the server to forward
// OAuth tokens to the Wails frontend.
type EventEmitter interface {
	Emit(name string, data any)
}

type Server struct {
	mux         *http.ServeMux
	srv         *http.Server
	svc         *service.Service
	engineerSvc *engineerservice.EngineerService
	distFS      fs.FS
	cfgDir      string
	emitter     EventEmitter
	nonceStore  *nonceStore
	rateLimiter *rateLimiter
}

type ServerConfig struct {
	Addr        string
	DistFS      fs.FS
	CfgDir      string
	Svc         *service.Service
	EngineerSvc *engineerservice.EngineerService
	Emitter     EventEmitter
}

func New(cfg ServerConfig) *Server {
	mux := http.NewServeMux()
	s := &Server{
		mux:         mux,
		svc:         cfg.Svc,
		engineerSvc: cfg.EngineerSvc,
		distFS:      cfg.DistFS,
		cfgDir:      cfg.CfgDir,
		emitter:     cfg.Emitter,
		nonceStore:  newNonceStore(),
		rateLimiter: newRateLimiter(10, 1*time.Minute),
	}

	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /overlay", s.handleOverlay)
	mux.HandleFunc("GET /api/profile", s.handleProfile)
	mux.HandleFunc("GET /api/profile-v3", s.handleProfileV3)
	mux.HandleFunc("GET /api/engineer/health", s.handleEngineerHealth)
	mux.HandleFunc("GET /telemetry/stream", s.handleSSE)
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
	data, err := fs.ReadFile(s.distFS, "index.html")
	if err != nil {
		http.Error(w, "index.html not found", http.StatusInternalServerError)
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

// authCallbackHTMLTmpl is served at /auth/callback with a one-time nonce
// embedded via fmt.Sprintf. Supabase returns the access_token in the URL
// fragment (#access_token=...); the page reads it, reads the nonce from
// AUTH_NONCE, and POSTs both to /auth/token.
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
  var AUTH_NONCE = '%s';
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
  var body = { access_token: token, nonce: AUTH_NONCE };
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
	nonce := s.nonceStore.Generate()
	html := fmt.Sprintf(authCallbackHTMLTmpl, nonce)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Write([]byte(html))
}

type authTokenPayload struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	Nonce        string `json:"nonce"`
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
	if !s.nonceStore.Consume(payload.Nonce) {
		http.Error(w, "invalid or expired nonce", http.StatusUnauthorized)
		return
	}

	log.Printf("auth: received OAuth token via local callback, forwarding to license:validate")
	s.emitter.Emit("license:validate", map[string]any{
		"sessionToken": payload.AccessToken,
		"refreshToken": payload.RefreshToken,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// GenerateNonce generates a one-time nonce for auth token requests. Exported
// for testing.
func (s *Server) GenerateNonce() string {
	return s.nonceStore.Generate()
}
