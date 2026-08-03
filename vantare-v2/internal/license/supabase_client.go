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

type supabaseClient interface {
	FetchCredential(context.Context, string, string) (*CredentialResponse, error)
	ResetDevice(context.Context, string, string) error
}

type stdlibSupabaseClient struct {
	baseURL, anonKey string
	httpClient       *http.Client
}

func NewStdlibSupabaseClient(baseURL, anonKey string) *stdlibSupabaseClient {
	return &stdlibSupabaseClient{
		baseURL: baseURL, anonKey: anonKey,
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

func (c *stdlibSupabaseClient) FetchCredential(ctx context.Context, sessionToken, fingerprint string) (*CredentialResponse, error) {
	body, err := json.Marshal(map[string]string{"deviceFingerprint": fingerprint})
	if err != nil {
		return nil, fmt.Errorf("encoding credential request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/functions/v1/license-credential", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("creating credential request: %w", err)
	}
	c.setHeaders(req, sessionToken)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("requesting license credential: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		var payload struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(data, &payload)
		if resp.StatusCode == http.StatusConflict && payload.Error == "device_limit" {
			return nil, ErrDeviceLimit
		}
		if resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != http.StatusTooManyRequests {
			return nil, fmt.Errorf("%w: status %d", ErrCredentialRejected, resp.StatusCode)
		}
		return nil, fmt.Errorf("license credential failed: %d", resp.StatusCode)
	}
	const maxCredentialResponseBytes = 64 << 10
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxCredentialResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("reading license credential: %w", err)
	}
	if len(data) > maxCredentialResponseBytes {
		return nil, fmt.Errorf("decoding license credential: response exceeds %d bytes", maxCredentialResponseBytes)
	}
	var response CredentialResponse
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&response); err != nil {
		return nil, fmt.Errorf("decoding license credential: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return nil, fmt.Errorf("decoding license credential: trailing data")
	}
	return &response, nil
}

func (c *stdlibSupabaseClient) ResetDevice(ctx context.Context, sessionToken, fingerprint string) error {
	body, err := json.Marshal(map[string]string{"device_fingerprint": fingerprint})
	if err != nil {
		return fmt.Errorf("encoding reset payload: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/rest/v1/rpc/reset_active_device", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("creating reset request: %w", err)
	}
	c.setHeaders(req, sessionToken)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("resetting device: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("reset device failed: %d", resp.StatusCode)
	}
	return nil
}

func (c *stdlibSupabaseClient) setHeaders(req *http.Request, sessionToken string) {
	req.Header.Set("Authorization", "Bearer "+sessionToken)
	req.Header.Set("apikey", c.anonKey)
	req.Header.Set("Content-Type", "application/json")
}
