package license

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

type EventEmitter interface{ Emit(name string, data any) }

const (
	LicenseChangedEvent  = "license:changed"
	LicenseValidateEvent = "license:validate"
)

type Service struct {
	cfg            Config
	client         supabaseClient
	cache          *LicenseCache
	verifier       *CredentialVerifier
	fingerprint    func() (string, error)
	subjectFromJWT func(string) (string, error)
	emitter        EventEmitter
}

func NewService(cfg Config, emitter EventEmitter, fingerprint func() (string, error)) *Service {
	if fingerprint == nil {
		fingerprint = MachineFingerprint
	}
	return &Service{
		cfg: cfg, emitter: emitter, fingerprint: fingerprint,
		subjectFromJWT: subjectFromJWT,
	}
}

func (s *Service) WithEmitter(e EventEmitter) *Service         { s.emitter = e; return s }
func (s *Service) WithClient(c supabaseClient) *Service        { s.client = c; return s }
func (s *Service) WithCache(c *LicenseCache) *Service          { s.cache = c; return s }
func (s *Service) WithVerifier(v *CredentialVerifier) *Service { s.verifier = v; return s }

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

func (s *Service) Validate(ctx context.Context, sessionToken string) (*Result, error) {
	return s.ValidateWithTrustedSession(ctx, sessionToken, "")
}

// ValidateWithTrustedSession allows offline fallback only when the presented
// token is exactly the session previously accepted into protected native
// storage. The JWT payload supplied by the WebView is never offline authority.
func (s *Service) ValidateWithTrustedSession(ctx context.Context, sessionToken, trustedSessionToken string) (*Result, error) {
	res, err := s.validate(ctx, sessionToken, trustedSessionToken)
	if err == nil && res != nil {
		s.EmitChanged(res)
	}
	return res, err
}

func (s *Service) validate(ctx context.Context, sessionToken, trustedSessionToken string) (*Result, error) {
	if sessionToken == "" {
		return &Result{State: StateAnonymous, Error: ErrMissingSession}, nil
	}
	subject, err := s.subjectFromJWT(sessionToken)
	if err != nil {
		return &Result{State: StateAnonymous, Error: fmt.Errorf("%w: invalid session subject", ErrValidationFailed)}, nil
	}
	cacheAuthorized := trustedSessionToken != "" && sessionToken == trustedSessionToken
	fingerprint, err := s.fingerprint()
	if err != nil {
		return nil, fmt.Errorf("fingerprint: %w", err)
	}
	if s.verifier == nil {
		return &Result{State: StateUnconfigured, Error: ErrUnconfigured}, nil
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if s.client != nil {
		response, callErr := s.client.FetchCredential(ctx, sessionToken, fingerprint)
		if errors.Is(callErr, ErrDeviceLimit) {
			return &Result{State: StateDeviceLimit, UserID: subject, DeviceOK: false, Error: ErrDeviceLimit}, nil
		}
		if callErr == nil && response == nil {
			return &Result{State: StateAuthenticatedNoEntitlement, UserID: subject, Error: fmt.Errorf("%w: empty credential response", ErrValidationFailed)}, nil
		}
		if callErr == nil {
			res, verifyErr := s.verifier.verifyOnline(&response.Credential, subject, fingerprint)
			if verifyErr != nil {
				return &Result{State: StateAuthenticatedNoEntitlement, UserID: subject, Error: fmt.Errorf("%w: %w", ErrValidationFailed, verifyErr)}, nil
			}
			if mergeErr := mergeOnlineCapabilities(res, response.OnlineCapabilities); mergeErr != nil {
				return &Result{State: StateAuthenticatedNoEntitlement, UserID: subject, Error: fmt.Errorf("%w: %w", ErrValidationFailed, mergeErr)}, nil
			}
			res.OnlineValidated = true
			if s.cache != nil {
				if err := s.cache.Write(&response.Credential); err != nil {
					res.Error = fmt.Errorf("writing license cache: %w", err)
				}
			}
			return res, nil
		}
		if errors.Is(callErr, ErrCredentialRejected) {
			return &Result{
				State: StateAuthenticatedNoEntitlement, UserID: subject,
				Error: fmt.Errorf("%w: %w", ErrValidationFailed, callErr),
			}, nil
		}
		if !cacheAuthorized {
			return &Result{State: StateAuthenticatedNoEntitlement, UserID: subject, Error: fmt.Errorf("%w: offline session is not trusted", ErrValidationFailed)}, nil
		}
		return s.fromCacheOnFailure(callErr, subject, fingerprint, false)
	}
	if !cacheAuthorized {
		return &Result{State: StateUnconfigured, UserID: subject, Error: ErrUnconfigured}, nil
	}
	return s.fromCacheOnFailure(ErrUnconfigured, subject, fingerprint, true)
}

func mergeOnlineCapabilities(res *Result, online []Capability) error {
	if res == nil {
		return ErrInvalidCredential
	}
	merged := make(map[Capability]struct{}, len(res.Capabilities)+len(online))
	for _, capability := range res.Capabilities {
		merged[capability] = struct{}{}
	}
	last := Capability("")
	for _, capability := range online {
		if _, ok := knownCapabilities[capability]; !ok || capability <= last {
			return ErrInvalidCredential
		}
		last = capability
		merged[capability] = struct{}{}
	}
	res.Capabilities = res.Capabilities[:0]
	for capability := range merged {
		res.Capabilities = append(res.Capabilities, capability)
	}
	res.Capabilities = SortedCapabilities(res.Capabilities)
	res.Entitlements = legacyEntitlements(res.Capabilities)
	if len(res.Capabilities) > 0 {
		res.State = StateActive
	}
	return nil
}

func (s *Service) fromCacheOnFailure(cause error, subject, fingerprint string, unconfigured bool) (*Result, error) {
	if s.cache == nil {
		if unconfigured {
			return &Result{State: StateUnconfigured, UserID: subject, Error: ErrUnconfigured}, nil
		}
		return &Result{State: StateAuthenticatedNoEntitlement, UserID: subject, Error: fmt.Errorf("%w: %w", ErrValidationFailed, cause)}, nil
	}
	credential, cacheErr := s.cache.Read()
	if cacheErr != nil {
		if unconfigured && (errors.Is(cacheErr, os.ErrNotExist) || errors.Is(cacheErr, ErrLegacyCache)) {
			return &Result{State: StateUnconfigured, UserID: subject, Error: fmt.Errorf("%w: %w", ErrUnconfigured, cacheErr)}, nil
		}
		return &Result{State: StateAuthenticatedNoEntitlement, UserID: subject, Error: fmt.Errorf("%w: %w", ErrValidationFailed, cacheErr)}, nil
	}
	res, verifyErr := s.verifier.verifyCached(credential, subject, fingerprint)
	if verifyErr != nil {
		return &Result{State: StateAuthenticatedNoEntitlement, UserID: subject, Error: fmt.Errorf("%w: %w", ErrValidationFailed, verifyErr)}, nil
	}
	res.Error = fmt.Errorf("%w: %w", ErrValidationFailed, cause)
	if res.State == StateActive {
		res.State = StateGrace
	}
	return res, nil
}

func (s *Service) HasEntitlement(ctx context.Context, token string, entitlement Entitlement) (bool, error) {
	res, err := s.Validate(ctx, token)
	if err != nil {
		return false, err
	}
	if res.State != StateActive && res.State != StateGrace {
		return false, nil
	}
	for _, current := range res.Entitlements {
		if current == entitlement {
			return true, nil
		}
	}
	return false, nil
}

func (s *Service) ResetDevice(ctx context.Context, sessionToken string) error {
	if sessionToken == "" {
		return ErrMissingSession
	}
	if s.client == nil {
		return fmt.Errorf("%w: no supabase client configured", ErrValidationFailed)
	}
	fingerprint, err := s.fingerprint()
	if err != nil {
		return fmt.Errorf("fingerprint: %w", err)
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := s.client.ResetDevice(ctx, sessionToken, fingerprint); err != nil {
		return err
	}
	res, validateErr := s.validate(ctx, sessionToken, "")
	if validateErr == nil && res != nil {
		s.EmitChanged(res)
	}
	return nil
}

func (s *Service) LoadCache() error {
	if s.cache == nil {
		return nil
	}
	_, err := s.cache.Read()
	if err != nil && !errors.Is(err, os.ErrNotExist) && !errors.Is(err, ErrLegacyCache) {
		return err
	}
	return nil
}

func subjectFromJWT(token string) (string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", ErrMissingSession
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}
	var claims struct {
		Subject string `json:"sub"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return "", err
	}
	if !isUUID(claims.Subject) {
		return "", ErrMissingSession
	}
	return claims.Subject, nil
}
