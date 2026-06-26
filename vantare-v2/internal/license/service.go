package license

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"
)

// Service is the main license validation orchestrator. It calls Supabase on
// the happy path, falls back to the local cache during the configured grace
// window when Supabase is unreachable, and returns typed states to callers.
type Service struct {
	cfg         Config
	client      supabaseClient
	cache       *LicenseCache
	fingerprint func() (string, error)
}

// NewService constructs a Service with the given configuration and a
// fingerprint function. The fingerprint function is injected so callers can
// override it in tests; in production, pass MachineFingerprint.
func NewService(cfg Config, fingerprint func() (string, error)) *Service {
	if fingerprint == nil {
		fingerprint = MachineFingerprint
	}
	return &Service{
		cfg:         cfg,
		fingerprint: fingerprint,
	}
}

// WithClient overrides the Supabase client. Used by tests to inject mocks.
func (s *Service) WithClient(c supabaseClient) *Service {
	s.client = c
	return s
}

// WithCache wires a local cache into the service. Used by both production
// main.go and tests.
func (s *Service) WithCache(c *LicenseCache) *Service {
	s.cache = c
	return s
}

// Validate is the primary entry point. It returns a typed Result describing
// the current license state. network errors never bubble up as Go errors; they
// are reflected in Result.Error and folded into StateGrace/StateExpired so
// the UI can render accordingly.
func (s *Service) Validate(ctx context.Context, sessionToken string) (*Result, error) {
	if sessionToken == "" {
		return &Result{State: StateAnonymous, Error: ErrMissingSession}, nil
	}

	fp, err := s.fingerprint()
	if err != nil {
		return nil, fmt.Errorf("fingerprint: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if s.client != nil {
		info, callErr := s.client.FetchAccount(ctx, sessionToken, fp)
		if callErr == nil {
			return s.fromSupabase(info, fp), nil
		}
		return s.fromCacheOnFailure(callErr)
	}

	if s.cache == nil {
		return &Result{State: StateExpired, Error: ErrValidationFailed}, nil
	}
	return s.fromCacheOnFailure(ErrValidationFailed)
}

func (s *Service) fromSupabase(info *AccountInfo, fingerprint string) *Result {
	state := StateAuthenticatedNoEntitlement
	if len(info.Entitlements) > 0 {
		state = StateActive
	}
	deviceOK := true
	if info.ActiveDevice != "" && info.ActiveDevice != fingerprint {
		state = StateDeviceLimit
		deviceOK = false
	}
	res := &Result{
		State:         state,
		Entitlements:  info.Entitlements,
		UserID:        info.UserID,
		Email:         info.Email,
		DeviceOK:      deviceOK,
		LastValidated: time.Now().UTC(),
	}
	// Only cache when the user has an active entitlement on this device. A
	// device-limit state must not be cached because the user is expected to
	// resolve it via ResetDevice.
	if state == StateActive && s.cache != nil {
		if err := s.cache.Write(state, info.Entitlements, info.ExpiresAt); err != nil {
			// Cache failure must not break validation. Surface as a soft error.
			res.Error = fmt.Errorf("writing license cache: %w", err)
		}
	}
	return res
}

func (s *Service) fromCacheOnFailure(cause error) (*Result, error) {
	if s.cache == nil {
		return &Result{State: StateExpired, Error: fmt.Errorf("%w: %w", ErrValidationFailed, cause)}, nil
	}
	state, ents, expires, cacheErr := s.cache.Read()
	if cacheErr != nil {
		if errors.Is(cacheErr, os.ErrNotExist) {
			return &Result{State: StateExpired, Error: fmt.Errorf("%w: %w", ErrValidationFailed, cause)}, nil
		}
		return &Result{State: StateExpired, Entitlements: ents, Error: fmt.Errorf("%w: %w", ErrValidationFailed, cause)}, nil
	}

	now := time.Now().UTC()
	wrappedErr := fmt.Errorf("%w: %w", ErrValidationFailed, cause)

	// No entitlements in cache: nothing to gate on. Surface as expired so the
	// UI offers the paywall or login flow.
	if len(ents) == 0 {
		return &Result{State: StateExpired, Entitlements: ents, Error: wrappedErr}, nil
	}

	// If the cached entitlement has a future expiration, the cache itself is
	// authoritative. We enter grace because Supabase is unreachable but the
	// subscription is still valid.
	if expires != nil && expires.After(now) {
		return &Result{
			State:         StateGrace,
			Entitlements:  ents,
			LastValidated: now,
			Error:         wrappedErr,
		}, nil
	}

	// No explicit expiration was cached (open-ended subscription). Grace is
	// anchored on the last successful validation timestamp.
	if expires == nil {
		graceStart := s.cache.UpdatedAt()
		if !graceStart.IsZero() && (state == StateActive || state == StateGrace) {
			graceEnd := graceStart.Add(s.cfg.GracePeriod)
			if now.Before(graceEnd) {
				return &Result{
					State:         StateGrace,
					Entitlements:  ents,
					LastValidated: now,
					GraceEndsAt:   &graceEnd,
					Error:         wrappedErr,
				}, nil
			}
		}
	}

	// Cached entitlement expired (or grace window exhausted): expired.
	return &Result{
		State:        StateExpired,
		Entitlements: ents,
		Error:        wrappedErr,
	}, nil
}

// HasEntitlement reports whether the user has the given entitlement, given
// the current state. During grace it still counts as having the entitlement.
// HasEntitlement never returns Go errors; network problems resolve to false.
func (s *Service) HasEntitlement(ctx context.Context, sessionToken string, e Entitlement) (bool, error) {
	res, err := s.Validate(ctx, sessionToken)
	if err != nil {
		return false, err
	}
	if res.State != StateActive && res.State != StateGrace {
		return false, nil
	}
	for _, have := range res.Entitlements {
		if have == e {
			return true, nil
		}
	}
	return false, nil
}

// ResetDevice calls the Supabase RPC to clear the active device so this
// machine can register itself as the active one on the next Validate.
func (s *Service) ResetDevice(ctx context.Context, sessionToken string) error {
	if sessionToken == "" {
		return ErrMissingSession
	}
	if s.client == nil {
		return fmt.Errorf("%w: no supabase client configured", ErrValidationFailed)
	}
	fp, err := s.fingerprint()
	if err != nil {
		return fmt.Errorf("fingerprint: %w", err)
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return s.client.ResetDevice(ctx, sessionToken, fp)
}

// LoadCache verifies the cache file is readable. Missing cache is not an
// error because the first run has no cache yet.
func (s *Service) LoadCache() error {
	if s.cache == nil {
		return nil
	}
	_, _, _, err := s.cache.Read()
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// SaveCache writes the cache directly. Used by tests and for explicit refresh.
func (s *Service) SaveCache(state State, entitlements []Entitlement, expiresAt *time.Time) error {
	if s.cache == nil {
		return ErrNoCache
	}
	return s.cache.Write(state, entitlements, expiresAt)
}
