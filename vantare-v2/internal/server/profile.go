package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/vantare/overlays/v2/pkg/config"
)

type profileResponse struct {
	Profile      *config.ProfileConfig `json:"profile"`
	LayoutOrigin config.Rect           `json:"layoutOrigin"`
}

func (s *Server) handleProfile(w http.ResponseWriter, r *http.Request) {
	profileParam := r.URL.Query().Get("profile")
	if profileParam == "" {
		http.Error(w, "profile query parameter required", http.StatusBadRequest)
		return
	}

	clean := filepath.Clean(profileParam)
	if strings.Contains(clean, "..") || filepath.IsAbs(clean) || strings.HasPrefix(clean, "/") || strings.HasPrefix(clean, "\\") {
		http.Error(w, "invalid profile path", http.StatusBadRequest)
		return
	}
	if !strings.HasSuffix(clean, ".json") {
		clean += ".json"
	}

	path, err := s.resolveProfilePath(profileParam)
	if err != nil {
		http.Error(w, "profile not found", http.StatusNotFound)
		return
	}

	p, err := config.LoadFile(path)
	if err != nil {
		http.Error(w, "failed to load profile", http.StatusInternalServerError)
		return
	}

	origin := config.LayoutOrigin(p, 8)

	resp := profileResponse{
		Profile:      p,
		LayoutOrigin: origin,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) resolveProfilePath(profileParam string) (string, error) {
	if s.cfgDir == "" {
		return "", fmt.Errorf("profiles directory not configured")
	}

	clean := filepath.Clean(profileParam)
	if strings.Contains(clean, "..") || filepath.IsAbs(clean) || strings.HasPrefix(clean, "/") || strings.HasPrefix(clean, "\\") {
		return "", fmt.Errorf("invalid profile path")
	}
	if !strings.HasSuffix(clean, ".json") {
		clean += ".json"
	}

	direct := filepath.Join(s.cfgDir, clean)
	if _, err := os.Stat(direct); err == nil {
		return direct, nil
	}

	stem := strings.TrimSuffix(clean, ".json")
	entries, err := os.ReadDir(s.cfgDir)
	if err != nil {
		return "", fmt.Errorf("read profiles dir: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		full := filepath.Join(s.cfgDir, entry.Name())
		p, err := config.LoadFile(full)
		if err != nil {
			continue
		}
		id := p.ID
		if id == "" {
			id = strings.TrimSuffix(entry.Name(), ".json")
		}
		if id == stem || id == profileParam || entry.Name() == clean {
			return full, nil
		}
	}

	return "", fmt.Errorf("profile not found: %s", profileParam)
}
