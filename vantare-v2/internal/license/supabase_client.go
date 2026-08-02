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

// NewStdlibSupabaseClient constructs a stdlib Supabase client. The caller is
// responsible for closing any resources on shutdown; the http.Client has no
// idle connections in tests (httptest.NewServer) and uses a 5s timeout.
func NewStdlibSupabaseClient(baseURL, anonKey string) *stdlibSupabaseClient {
	return &stdlibSupabaseClient{
		baseURL:    baseURL,
		anonKey:    anonKey,
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

func (c *stdlibSupabaseClient) FetchAccount(ctx context.Context, sessionToken string, fingerprint string) (*AccountInfo, error) {
	if err := c.callRPC(ctx, sessionToken, "claim_active_device", map[string]string{"device_fingerprint": fingerprint}, nil); err != nil {
		return nil, fmt.Errorf("claiming active device: %w", err)
	}
	var raw json.RawMessage
	if err := c.callRPC(ctx, sessionToken, "read_account_entitlements", map[string]string{}, &raw); err != nil {
		return nil, fmt.Errorf("reading account entitlements: %w", err)
	}
	info, err := decodeAccountInfo(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("decoding account: %w", err)
	}
	return info, nil
}

func (c *stdlibSupabaseClient) callRPC(ctx context.Context, sessionToken, name string, payload any, destination *json.RawMessage) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encoding %s payload: %w", name, err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/rest/v1/rpc/"+name, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("creating %s request: %w", name, err)
	}
	req.Header.Set("Authorization", "Bearer "+sessionToken)
	req.Header.Set("apikey", c.anonKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("calling %s: %w", name, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("%s failed: %d %s", name, resp.StatusCode, string(msg))
	}
	if destination != nil {
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("reading %s response: %w", name, err)
		}
		*destination = data
	}
	return nil
}

// decodeAccountInfo accepts PostgREST RPC payloads as either a single object
// ({...}) or a one-row array ([{...}]) for functions that RETURNS TABLE.
func decodeAccountInfo(r io.Reader) (*AccountInfo, error) {
	raw, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return nil, fmt.Errorf("empty account response")
	}

	if raw[0] == '[' {
		var rows []AccountInfo
		if err := json.Unmarshal(raw, &rows); err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			return nil, fmt.Errorf("empty account response array")
		}
		return &rows[0], nil
	}

	var info AccountInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		return nil, err
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
