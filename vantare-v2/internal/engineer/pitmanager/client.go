package pitmanager

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

const (
	defaultBaseURL   = "http://localhost:6397"
	PitActionRequest = "request"
	PitActionConfirm = "confirm"
	PitActionAbort   = "abort"
)

// PitMenuClient is a REST client for LMU's pit menu API.
type PitMenuClient struct {
	baseURL    string
	httpClient *http.Client
	dryRun     bool
}

// NewPitMenuClient creates a new client with default settings.
func NewPitMenuClient() *PitMenuClient {
	return &PitMenuClient{
		baseURL:    strings.TrimRight(defaultBaseURL, "/"),
		httpClient: &http.Client{},
		dryRun:     true,
	}
}

// NewPitMenuClientWithURL creates a client with a custom base URL.
func NewPitMenuClientWithURL(baseURL string) *PitMenuClient {
	return &PitMenuClient{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{},
		dryRun:     true,
	}
}

// SetDryRun enables or disables dry-run mode. When dry-run is enabled,
// pit actions are logged but not actually sent to LMU.
func (c *PitMenuClient) SetDryRun(v bool) {
	c.dryRun = v
}

// GetStatus returns the current pit menu status from LMU.
func (c *PitMenuClient) GetStatus() (*PitMenuStatus, error) {
	var status PitMenuStatus
	if err := c.getJSON("/rest/pitmenu/status", &status); err != nil {
		return nil, err
	}
	return &status, nil
}

// GetStandings returns the current race standings from LMU.
func (c *PitMenuClient) GetStandings() (*Standings, error) {
	var rows []StandingRow
	if err := c.getJSON("/rest/watch/standings", &rows); err != nil {
		return nil, err
	}
	return &Standings{Rows: rows}, nil
}

// RequestPitAction sends a pit menu action (request/confirm/abort) to LMU.
// If dryRun is enabled, the action is not actually sent.
func (c *PitMenuClient) RequestPitAction(action string) error {
	if c.dryRun {
		return nil
	}

	body := pitActionRequest{Action: action}
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(body); err != nil {
		return fmt.Errorf("pitmanager: encode action: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL+"/rest/pitmenu/action", "application/json", &buf)
	if err != nil {
		return fmt.Errorf("pitmanager: post action: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("pitmanager: POST /rest/pitmenu/action: HTTP %d", resp.StatusCode)
	}
	return nil
}

// GetWeather returns current weather/session info from LMU REST API.
func (c *PitMenuClient) GetWeather() (*WeatherData, error) {
	var w WeatherData
	if err := c.getJSON("/rest/watch/sessionInfo", &w); err != nil {
		return nil, fmt.Errorf("pitmanager: weather: %w", err)
	}
	return &w, nil
}

// pitActionRequest is the JSON body sent to LMU.
type pitActionRequest struct {
	Action string `json:"action"`
}

// getJSON performs a GET request and decodes the JSON response into out.
func (c *PitMenuClient) getJSON(path string, out any) error {
	resp, err := c.httpClient.Get(c.baseURL + path)
	if err != nil {
		return fmt.Errorf("pitmanager: GET %s: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("pitmanager: GET %s: HTTP %d", path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
