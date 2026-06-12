package server

import (
	"context"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/service"
)

type Server struct {
	mux    *http.ServeMux
	srv    *http.Server
	svc    *service.Service
	distFS fs.FS
	cfgDir string
}

type ServerConfig struct {
	Addr   string
	DistFS fs.FS
	CfgDir string
	Svc    *service.Service
}

func New(cfg ServerConfig) *Server {
	mux := http.NewServeMux()
	s := &Server{
		mux:    mux,
		svc:    cfg.Svc,
		distFS: cfg.DistFS,
		cfgDir: cfg.CfgDir,
	}

	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /overlay", s.handleOverlay)
	mux.HandleFunc("GET /api/profile", s.handleProfile)
	mux.HandleFunc("GET /telemetry/stream", s.handleSSE)
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

func (s *Server) Start() {
	if s.srv == nil {
		log.Println("HTTP server: no address configured, skipping")
		return
	}
	go func() {
		log.Printf("HTTP server listening on %s", s.srv.Addr)
		if err := s.srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP server error: %v", err)
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
