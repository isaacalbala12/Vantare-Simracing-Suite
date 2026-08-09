package license

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
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
	currentMu      sync.RWMutex
	current        *Result
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

// inconclusiveAnonymous reports a result that came back anonymous only because
// nobody presented a session, which is not the same claim as "this session is
// no longer valid". The frontend fires a tokenless validate on mount, before
// the stored session has been restored, so one of these arrives on every
// launch.
func inconclusiveAnonymous(res *Result) bool {
	return res != nil &&
		res.State == StateAnonymous &&
		errors.Is(res.Error, ErrMissingSession)
}

// ClearCurrent drops the authority this service holds. Signing out is the only
// conclusive way to stop being someone, so it is the only caller.
func (s *Service) ClearCurrent() {
	if s == nil {
		return
	}
	s.currentMu.Lock()
	s.current = nil
	s.currentMu.Unlock()
}

func (s *Service) EmitChanged(res *Result) {
	if s == nil || res == nil {
		return
	}
	s.currentMu.Lock()
	// That tokenless anonymous used to overwrite an authenticated result, and
	// with it the capabilities AllowsUpdateChannel reads. An owner then got a
	// UI offering nightly -- the frontend ignores the very same event, on
	// purpose -- while the backend refused it as "not authorized". The two have
	// to agree, and the authenticated answer is the true one.
	if !inconclusiveAnonymous(res) || s.current == nil || s.current.State == StateAnonymous {
		copyResult := *res
		copyResult.Capabilities = append([]Capability(nil), res.Capabilities...)
		copyResult.OperationalRoles = append([]OperationalRole(nil), res.OperationalRoles...)
		s.current = &copyResult
	}
	s.currentMu.Unlock()
	if s.emitter == nil {
		return
	}
	// The event goes out either way: the frontend has its own guard, and in
	// standalone mode this response is what resolves the loading state.
	wire := res.ToWire()
	if wire.LastValidated == "" {
		wire.LastValidated = time.Now().UTC().Format(time.RFC3339Nano)
	}
	s.emitter.Emit(LicenseChangedEvent, wire)
}

func (s *Service) AllowsUpdateChannel(channel string) bool {
	if channel == "stable" {
		return true
	}
	s.currentMu.RLock()
	defer s.currentMu.RUnlock()
	if s.current == nil || (s.current.State != StateActive && s.current.State != StateGrace) {
		return false
	}
	has := func(wanted ...Capability) bool {
		for _, current := range s.current.Capabilities {
			for _, capability := range wanted {
				if current == capability {
					return true
				}
			}
		}
		return false
	}
	switch channel {
	case "testers":
		return has(CapabilityTesters, CapabilityNightly, CapabilityOperationalTester, CapabilityOperationalNightlyTester, CapabilityOperationalOwner)
	case "nightly":
		return has(CapabilityNightly, CapabilityOperationalNightlyTester, CapabilityOperationalOwner)
	default:
		return false
	}
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
	res.OperationalRoles = operationalRoles(res.Capabilities)
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

// EmitCachedState publica el estado guardado en cache nada mas arrancar, sin
// esperar a la red.
//
// La arquitectura ya lo especifica -- "User opens app -> LoadCache() -> gate by
// cached state" -- y LoadCache se llamaba en el arranque, pero nadie emitia el
// resultado. El frontend se quedaba bloqueado en "Cargando licencia..." durante
// la validacion contra Supabase, que tarda entre uno y tres segundos.
//
// No relaja ninguna comprobacion: usa la misma verificacion offline que la ruta
// de gracia, sobre una credencial firmada Ed25519 y atada a la huella de este
// dispositivo. La validacion online sigue su curso y corrige el estado despues.
func (s *Service) EmitCachedState() {
	if s == nil || s.cache == nil || s.verifier == nil {
		return
	}
	credential, err := s.cache.Read()
	if err != nil {
		return
	}
	fingerprint, err := s.fingerprint()
	if err != nil {
		return
	}
	result, err := s.verifier.verifyCached(credential, credential.Claims.Subject, fingerprint)
	if err != nil || result == nil {
		return
	}
	s.EmitChanged(result)
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
