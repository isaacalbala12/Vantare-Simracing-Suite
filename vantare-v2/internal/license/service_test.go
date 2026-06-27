package license

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"
)

// mockSupabaseClient is a deterministic in-memory supabaseClient for tests.
type mockSupabaseClient struct {
	info *AccountInfo
	err  error

	resetCalls int
}

func (m *mockSupabaseClient) FetchAccount(_ context.Context, _, _ string) (*AccountInfo, error) {
	return m.info, m.err
}

func (m *mockSupabaseClient) ResetDevice(_ context.Context, _, _ string) error {
	m.resetCalls++
	return nil
}

func TestValidateStates(t *testing.T) {
	future := time.Now().Add(time.Hour).UTC().Truncate(time.Second)
	past := time.Now().Add(-2 * time.Hour).UTC().Truncate(time.Second)

	cases := []struct {
		name        string
		setupCache  func(*LicenseCache) error
		sbInfo      *AccountInfo
		sbErr       error
		expectState State
	}{
		{
			name: "active from supabase",
			sbInfo: &AccountInfo{
				UserID:       "u1",
				Email:        "u1@example.com",
				Entitlements: []Entitlement{EntitlementOverlays},
				ActiveDevice: "fp",
				ExpiresAt:    &future,
			},
			expectState: StateActive,
		},
		{
			name: "authenticated no entitlement",
			sbInfo: &AccountInfo{
				UserID:       "u1",
				Email:        "u1@example.com",
				Entitlements: nil,
				ActiveDevice: "fp",
			},
			expectState: StateAuthenticatedNoEntitlement,
		},
		{
			name: "device limit",
			sbInfo: &AccountInfo{
				UserID:       "u1",
				Email:        "u1@example.com",
				Entitlements: []Entitlement{EntitlementOverlays},
				ActiveDevice: "other-fp",
				ExpiresAt:    &future,
			},
			expectState: StateDeviceLimit,
		},
		{
			name: "grace from cache when supabase down",
			setupCache: func(c *LicenseCache) error {
				return c.Write(StateActive, []Entitlement{EntitlementOverlays}, &future)
			},
			sbErr:       errors.New("supabase down"),
			expectState: StateGrace,
		},
		{
			name: "expired when cache past and supabase down",
			setupCache: func(c *LicenseCache) error {
				return c.Write(StateActive, []Entitlement{EntitlementOverlays}, &past)
			},
			sbErr:       errors.New("supabase down"),
			expectState: StateExpired,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			cache := NewLicenseCache(dir + "/cache.json")
			if tc.setupCache != nil {
				if err := tc.setupCache(cache); err != nil {
					t.Fatalf("setup cache: %v", err)
				}
			}
			svc := NewService(Config{GracePeriod: 24 * time.Hour}, nil, func() (string, error) { return "fp", nil })
			svc.WithCache(cache)
			svc.WithClient(&mockSupabaseClient{info: tc.sbInfo, err: tc.sbErr})

			res, err := svc.Validate(context.Background(), "token")
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.State != tc.expectState {
				t.Fatalf("expected state %s, got %s", tc.expectState, res.State)
			}
		})
	}
}

func TestValidateMissingSession(t *testing.T) {
	svc := NewService(Config{}, nil, func() (string, error) { return "fp", nil })
	res, err := svc.Validate(context.Background(), "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.State != StateAnonymous {
		t.Fatalf("expected anonymous, got %s", res.State)
	}
	if !errors.Is(res.Error, ErrMissingSession) {
		t.Fatalf("expected ErrMissingSession, got %v", res.Error)
	}
}

func TestValidateFingerprintError(t *testing.T) {
	svc := NewService(Config{}, nil, func() (string, error) { return "", errors.New("nope") })
	_, err := svc.Validate(context.Background(), "token")
	if err == nil {
		t.Fatal("expected error from fingerprint failure")
	}
}

func TestValidateGraceFromExpiredCache(t *testing.T) {
	dir := t.TempDir()
	cache := NewLicenseCache(dir + "/cache.json")
	// Cache was updated recently but the subscription expired 1h ago.
	// Within the 24h grace window we expect StateGrace.
	if err := cache.Write(StateActive, []Entitlement{EntitlementOverlays}, nil); err != nil {
		t.Fatalf("write cache: %v", err)
	}
	svc := NewService(Config{GracePeriod: 24 * time.Hour}, nil, func() (string, error) { return "fp", nil })
	svc.WithCache(cache)
	svc.WithClient(&mockSupabaseClient{err: errors.New("network down")})

	res, err := svc.Validate(context.Background(), "token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.State != StateGrace {
		t.Fatalf("expected grace from recent cache, got %s", res.State)
	}
	if res.GraceEndsAt == nil {
		t.Fatal("expected GraceEndsAt to be set during grace")
	}
}

func TestValidateExpiredAfterGrace(t *testing.T) {
	dir := t.TempDir()
	cache := NewLicenseCache(dir + "/cache.json")
	// Backdate the UpdatedAt to be > GracePeriod in the past.
	cl := cachedLicense{
		State:        StateActive,
		Entitlements: []Entitlement{EntitlementOverlays},
		ExpiresAt:    nil,
		UpdatedAt:    time.Now().UTC().Add(-48 * time.Hour),
	}
	if err := writeRawCache(cache.Path(), cl); err != nil {
		t.Fatalf("seed cache: %v", err)
	}

	svc := NewService(Config{GracePeriod: 24 * time.Hour}, nil, func() (string, error) { return "fp", nil })
	svc.WithCache(cache)
	svc.WithClient(&mockSupabaseClient{err: errors.New("network down")})

	res, err := svc.Validate(context.Background(), "token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.State != StateExpired {
		t.Fatalf("expected expired after grace, got %s", res.State)
	}
}

func TestHasEntitlementActive(t *testing.T) {
	future := time.Now().Add(time.Hour).UTC()
	svc := NewService(Config{}, nil, func() (string, error) { return "fp", nil })
	svc.WithClient(&mockSupabaseClient{info: &AccountInfo{
		UserID:       "u1",
		Entitlements: []Entitlement{EntitlementBundle},
		ActiveDevice: "fp",
		ExpiresAt:    &future,
	}})

	got, err := svc.HasEntitlement(context.Background(), "token", EntitlementBundle)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got {
		t.Fatal("expected bundle entitlement to be present")
	}
}

func TestHasEntitlementMissing(t *testing.T) {
	future := time.Now().Add(time.Hour).UTC()
	svc := NewService(Config{}, nil, func() (string, error) { return "fp", nil })
	svc.WithClient(&mockSupabaseClient{info: &AccountInfo{
		UserID:       "u1",
		Entitlements: []Entitlement{EntitlementOverlays},
		ActiveDevice: "fp",
		ExpiresAt:    &future,
	}})

	got, err := svc.HasEntitlement(context.Background(), "token", EntitlementEngineer)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got {
		t.Fatal("expected missing entitlement to be reported as false")
	}
}

func TestResetDeviceRequiresSession(t *testing.T) {
	svc := NewService(Config{}, nil, func() (string, error) { return "fp", nil })
	if err := svc.ResetDevice(context.Background(), ""); !errors.Is(err, ErrMissingSession) {
		t.Fatalf("expected ErrMissingSession, got %v", err)
	}
}

func TestResetDeviceCallsClient(t *testing.T) {
	mock := &mockSupabaseClient{}
	svc := NewService(Config{}, nil, func() (string, error) { return "fp", nil })
	svc.WithClient(mock)
	if err := svc.ResetDevice(context.Background(), "token"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.resetCalls != 1 {
		t.Fatalf("expected 1 reset call, got %d", mock.resetCalls)
	}
}

func TestResetDeviceRequiresClient(t *testing.T) {
	svc := NewService(Config{}, nil, func() (string, error) { return "fp", nil })
	if err := svc.ResetDevice(context.Background(), "token"); !errors.Is(err, ErrValidationFailed) {
		t.Fatalf("expected ErrValidationFailed, got %v", err)
	}
}

func TestSaveCacheWithoutCache(t *testing.T) {
	svc := NewService(Config{}, nil, func() (string, error) { return "fp", nil })
	err := svc.SaveCache(StateActive, nil, nil)
	if !errors.Is(err, ErrNoCache) {
		t.Fatalf("expected ErrNoCache, got %v", err)
	}
}

// writeRawCache is a test helper that bypasses Write to backdate UpdatedAt.
func writeRawCache(path string, cl cachedLicense) error {
	data, err := json.MarshalIndent(cl, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}
