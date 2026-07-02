package lmuapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Client is an HTTP client for the LMU local REST API.
type Client struct {
	baseURL string
	http    *http.Client
}

// NewClient creates a new Client. If timeout <= 0, defaults to 750ms.
func NewClient(baseURL string, timeout time.Duration) *Client {
	if timeout <= 0 {
		timeout = 750 * time.Millisecond
	}
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: timeout},
	}
}

// Standings fetches the live standings. Deprecated: use StandingsWithContext.
func (c *Client) Standings() ([]StandingRow, error) {
	return c.StandingsWithContext(context.Background())
}

// StandingsWithContext fetches the live standings with a context.
func (c *Client) StandingsWithContext(ctx context.Context) ([]StandingRow, error) {
	var rows []StandingRow
	if err := c.getJSON(ctx, "/rest/watch/standings", &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// SessionInfo fetches the current session metadata. Deprecated: use SessionInfoWithContext.
func (c *Client) SessionInfo() (*SessionInfo, error) {
	return c.SessionInfoWithContext(context.Background())
}

// SessionInfoWithContext fetches the current session metadata with a context.
func (c *Client) SessionInfoWithContext(ctx context.Context) (*SessionInfo, error) {
	var info SessionInfo
	if err := c.getJSON(ctx, "/rest/watch/sessionInfo", &info); err != nil {
		return nil, err
	}
	return &info, nil
}

// MultiplayerTeams fetches the multiplayer teams/drivers data with a context.
func (c *Client) MultiplayerTeams(ctx context.Context) (*MultiplayerTeamsResponse, error) {
	var resp MultiplayerTeamsResponse
	if err := c.getJSON(ctx, "/rest/multiplayer/teams", &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// getJSON performs a GET request and decodes the JSON response.
func (c *Client) getJSON(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return fmt.Errorf("lmu api %s: create request: %w", path, err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("lmu api %s: %w", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("lmu api %s: HTTP %d", path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
