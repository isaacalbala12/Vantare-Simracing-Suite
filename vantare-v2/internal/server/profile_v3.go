package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/vantare/overlays/v2/pkg/config"
)

type profileV3Response struct {
	Document     *config.ProfileDocumentV3 `json:"document"`
	Revision     string                    `json:"revision"`
	LayoutOrigin config.Rect               `json:"layoutOrigin"`
}

func (s *Server) handleProfileV3(w http.ResponseWriter, r *http.Request) {
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

	path, err := s.resolveProfilePath(profileParam)
	if err != nil {
		http.Error(w, "profile not found", http.StatusNotFound)
		return
	}

	loaded, err := config.ProfileDocumentStore{}.Load(path)
	if err != nil {
		status, message := profileV3LoadError(err)
		http.Error(w, message, status)
		return
	}

	origin := config.LayoutOriginV3(loaded.Document, 8)
	resp := profileV3Response{
		Document:     loaded.Document,
		Revision:     loaded.Revision,
		LayoutOrigin: origin,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		http.Error(w, "failed to encode profile", http.StatusInternalServerError)
	}
}

func profileV3LoadError(err error) (int, string) {
	var validation config.ProfileValidationError
	if errors.As(err, &validation) {
		return http.StatusBadRequest, "invalid profile"
	}
	return http.StatusBadRequest, "failed to load profile"
}
