package server

import (
	"context"
	"encoding/json"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"time"

	engineerservice "github.com/vantare/overlays/v2/internal/engineer/service"
	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

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
	}

	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /overlay", s.handleOverlay)
	mux.HandleFunc("GET /api/profile", s.handleProfile)
	mux.HandleFunc("GET /telemetry/stream", s.handleSSE)
	mux.HandleFunc("GET /engineer/stream", s.handleEngineerSSE)
	mux.HandleFunc("GET /auth/callback", s.handleAuthCallback)
	mux.HandleFunc("POST /auth/token", s.handleAuthToken)
	if cfg.DistFS != nil {
		mux.Handle("GET /assets/", http.FileServerFS(cfg.DistFS))
		mux.Handle("GET /favicon.svg", http.FileServerFS(cfg.DistFS))
	}

	if cfg.Addr != "" {
		s.srv = &http.Server{
			Addr:    cfg.Addr,
			Handler: mux,
		}
	}

	return s
}

func (s *Server) Handler() http.Handler {
	return s.mux
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

// authCallbackHTML is the static HTML page served at /auth/callback. The
// external browser redirects here after completing the OAuth flow. Supabase
// returns the access_token in the URL fragment (#access_token=...) which is
// only accessible to client-side JavaScript. The page reads it and POSTs it
// to /auth/token so the Go server can forward it to the Wails app.
const authCallbackHTML = `<!DOCTYPE html>
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
  var hash = window.location.hash.substring(1);
  var params = new URLSearchParams(hash);
  var token = params.get('access_token');
  if (!token) {
    var search = window.location.search;
    token = new URLSearchParams(search).get('access_token');
  }
  if (!token) {
    msg.textContent = 'No se recibió token de autenticación.';
    msg.classList.add('err');
    hint.textContent = 'Vuelve a la app Vantare e intenta de nuevo.';
    return;
  }
  fetch('/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token })
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
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(authCallbackHTML))
}

func (s *Server) handleAuthToken(w http.ResponseWriter, r *http.Request) {
	if s.emitter == nil {
		http.Error(w, "emitter not configured", http.StatusInternalServerError)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<16)) // 64 KiB max
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var payload struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || payload.AccessToken == "" {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	log.Printf("auth: received OAuth token via local callback, forwarding to license:validate")
	s.emitter.Emit("license:validate", map[string]any{
		"sessionToken": payload.AccessToken,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}
