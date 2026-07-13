package license

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"
)

// EventEmitter is the minimal contract required by Service to notify the UI
// after license state changes. Wails' application.App satisfies it.
type EventEmitter interface {
	Emit(name string, data any)
}

// LicenseChangedEvent is the Wails event name used to broadcast license
// state changes to the frontend.
const LicenseChangedEvent = "license:changed"

// LicenseValidateEvent is the Wails event name used by the frontend to
// request a fresh license validation cycle.
const LicenseValidateEvent = "license:validate"

// Service is the main license validation orchestrator. It calls Supabase on
// the happy path, falls back to the local cache during the configured grace
// window when Supabase is unreachable, and returns typed states to callers.
type Service struct {
	cfg         Config
	client      supabaseClient
	cache       *LicenseCache
	fingerprint func() (string, error)
	emitter     EventEmitter
}

// NewService constructs a Service with the given configuration, an optional
// event emitter and a fingerprint function. The fingerprint function is
// injected so callers can override it in tests; in production, pass
// MachineFingerprint. The emitter may be nil, in which case license:changed
// events are skipped silently (useful for tests and headless contexts).
func NewService(cfg Config, emitter EventEmitter, fingerprint func() (string, error)) *Service {
	if fingerprint == nil {
		fingerprint = MachineFingerprint
	}
	return &Service{
		cfg:         cfg,
		fingerprint: fingerprint,
		emitter:     emitter,
	}
}

// WithEmitter sets or replaces the event emitter after construction.
// Production wiring passes the emitter to NewService; this helper remains
// available mainly for tests that need to swap emitters after construction.
func (s *Service) WithEmitter(e EventEmitter) *Service {
	s.emitter = e
	return s
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

// EmitChanged broadcasts the supplied Result as a license:changed event. It is
// safe to call with a nil emitter (the call is a no-op) and with a nil
// result (no payload is sent). Exposed publicly so main.go can re-emit after
// operations like ResetDevice.
func (s *Service) EmitChanged(res *Result) {
	if s == nil || s.emitter == nil || res == nil {
		return
	}
	wire := res.ToWire()
	if wire.LastValidated == "" {
		wire.LastValidated = time.Now().UTC().Format(time.RFC3339Nano)
	}
	s.emitter.Emit(LicenseChangedEvent, wire)
}

// Validate is the primary entry point. It returns a typed Result describing
// the current license state. network errors never bubble up as Go errors; they
// are reflected in Result.Error and folded into StateGrace/StateExpired so
// the UI can render accordingly. After a successful validation, the result is
// broadcast on the license:changed Wails event so the UI updates
// reactively without an extra round-trip.
func (s *Service) Validate(ctx context.Context, sessionToken string) (*Result, error) {
	res, err := s.validate(ctx, sessionToken)
	if err == nil && res != nil {
		s.EmitChanged(res)
	}
	return res, err
}

// validate contains the validation logic without the event side-effect. Split
// out so ResetDevice and other callers can reuse it without re-entering the
// emit cycle.
func (s *Service) validate(ctx context.Context, sessionToken string) (*Result, error) {
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
		return s.fromCacheOnFailure(callErr, false)
	}

	// No Supabase client configured. We must not fall back to StateExpired
	// unconditionally because that would block authenticated users behind a
	// paywall for a configuration issue, not a real entitlement problem.
	// When there is no cache either, surface StateUnconfigured so the UI can
	// show an actionable message instead of a false "expired" block.
	if s.cache == nil {
		return &Result{State: StateUnconfigured, Error: ErrUnconfigured}, nil
	}
	return s.fromCacheOnFailure(ErrUnconfigured, true)
}

func (s *Service) fromSupabase(info *AccountInfo, fingerprint string) *Result {
	state := StateAuthenticatedNoEntitlement
	entitlements := []Entitlement{}
	userID := ""
	email := ""
	var expiresAt *time.Time
	if info != nil {
		if len(info.Entitlements) > 0 {
			state = StateActive
			entitlements = info.Entitlements
		}
		userID = info.UserID
		email = info.Email
		expiresAt = info.ExpiresAt
	}
	deviceOK := true
	if info != nil && info.ActiveDevice != "" && info.ActiveDevice != fingerprint {
		state = StateDeviceLimit
		deviceOK = false
	}
	res := &Result{
		State:         state,
		Entitlements:  entitlements,
		UserID:        userID,
		Email:         email,
		DeviceOK:      deviceOK,
		LastValidated: time.Now().UTC(),
	}
	// Only cache when the user has an active entitlement on this device. A
	// device-limit state must not be cached because the user is expected to
	// resolve it via ResetDevice.
	if state == StateActive && s.cache != nil {
		if err := s.cache.Write(state, entitlements, expiresAt); err != nil {
			// Cache failure must not break validation. Surface as a soft error.
			res.Error = fmt.Errorf("writing license cache: %w", err)
		}
	}
	return res
}

// fromCacheOnFailure resolves the license state from the local cache when the
// Supabase client is unavailable. When unconfigured is true (no Supabase
// client was wired at all), empty/missing caches surface as StateUnconfigured
// instead of StateExpired so the UI can show an actionable configuration error
// rather than a false paywall block. When unconfigured is false (the client
// exists but the network call failed), the original expired/grace semantics
// are preserved.
func (s *Service) fromCacheOnFailure(cause error, unconfigured bool) (*Result, error) {
	if s.cache == nil {
		if unconfigured {
			return &Result{State: StateUnconfigured, Error: fmt.Errorf("%w: %w", ErrUnconfigured, cause)}, nil
		}
		// Client was configured but the RPC call failed (network, 404, etc.)
		// and there is no cache. For a first-time user this must NOT return
		// expired because that would block an authenticated user behind a
		// paywall for a transient or configuration error. Surface as
		// authenticated-no-entitlement (Free) so the user can enter the Hub.
		return &Result{State: StateAuthenticatedNoEntitlement, Error: fmt.Errorf("%w: %w", ErrValidationFailed, cause)}, nil
	}
	state, ents, expires, cacheErr := s.cache.Read()
	if cacheErr != nil {
		if errors.Is(cacheErr, os.ErrNotExist) {
			if unconfigured {
				return &Result{State: StateUnconfigured, Error: fmt.Errorf("%w: %w", ErrUnconfigured, cause)}, nil
			}
			return &Result{State: StateAuthenticatedNoEntitlement, Error: fmt.Errorf("%w: %w", ErrValidationFailed, cause)}, nil
		}
		if unconfigured {
			return &Result{State: StateUnconfigured, Entitlements: ents, Error: fmt.Errorf("%w: %w", ErrUnconfigured, cause)}, nil
		}
		return &Result{State: StateAuthenticatedNoEntitlement, Entitlements: ents, Error: fmt.Errorf("%w: %w", ErrValidationFailed, cause)}, nil
	}

	now := time.Now().UTC()
	wrappedErr := fmt.Errorf("%w: %w", ErrValidationFailed, cause)

	// No entitlements in cache: nothing to gate on. When the backend is
	// unconfigured, surface as unconfigured so the UI shows an actionable
	// message. When the backend is configured but Supabase is unreachable,
	// surface as authenticated-no-entitlement (Free) so the user is not
	// blocked behind a false paywall.
	if len(ents) == 0 {
		if unconfigured {
			return &Result{State: StateUnconfigured, Entitlements: ents, Error: fmt.Errorf("%w: %w", ErrUnconfigured, cause)}, nil
		}
		return &Result{State: StateAuthenticatedNoEntitlement, Entitlements: ents, Error: wrappedErr}, nil
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
// machine can register itself as the active one on the next Validate. After
// a successful reset, the service re-validates and broadcasts the new state
// on license:changed so the UI unlocks immediately.
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
	if err := s.client.ResetDevice(ctx, sessionToken, fp); err != nil {
		return err
	}
	// Best-effort revalidation so the UI flips out of device-limit. We do not
	// surface revalidation errors here — ResetDevice already succeeded and
	// the next frontend refresh will produce the canonical result.
	res, verr := s.validate(ctx, sessionToken)
	if verr == nil && res != nil {
		s.EmitChanged(res)
	}
	return nil
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
