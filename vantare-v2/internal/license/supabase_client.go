package license

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// supabaseClient abstracts the Supabase REST calls needed by LicenseService so
// tests can substitute a mock implementation.
type supabaseClient interface {
	FetchAccount(ctx context.Context, sessionToken string, fingerprint string) (*AccountInfo, error)
	ResetDevice(ctx context.Context, sessionToken string, fingerprint string) error
}

// stdlibSupabaseClient implements supabaseClient using only the Go standard
// library. It POSTs to Supabase RPC endpoints with the user's JWT and the
// anon key for RLS-aware reads.
type stdlibSupabaseClient struct {
	baseURL    string
	anonKey    string
	httpClient *http.Client
}

// newStdlibSupabaseClient constructs a stdlib Supabase client. The caller is
// responsible for closing any resources on shutdown; the http.Client has no
// idle connections in tests (httptest.NewServer) and uses a 5s timeout.
func newStdlibSupabaseClient(baseURL, anonKey string) *stdlibSupabaseClient {
	return &stdlibSupabaseClient{
		baseURL:    baseURL,
		anonKey:    anonKey,
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

func (c *stdlibSupabaseClient) FetchAccount(ctx context.Context, sessionToken string, fingerprint string) (*AccountInfo, error) {
	payload := map[string]string{"device_fingerprint": fingerprint}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encoding fetch payload: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/rest/v1/rpc/get_account_entitlements", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("creating fetch request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+sessionToken)
	req.Header.Set("apikey", c.anonKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching account: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("fetch account failed: %d %s", resp.StatusCode, string(msg))
	}

	var info AccountInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("decoding account: %w", err)
	}
	return &info, nil
}

func (c *stdlibSupabaseClient) ResetDevice(ctx context.Context, sessionToken string, fingerprint string) error {
	payload := map[string]string{"device_fingerprint": fingerprint}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encoding reset payload: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/rest/v1/rpc/reset_active_device", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("creating reset request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+sessionToken)
	req.Header.Set("apikey", c.anonKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("resetting device: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("reset device failed: %d %s", resp.StatusCode, string(msg))
	}
	return nil
}
