package license

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	CredentialVersion   = 1
	CredentialAlgorithm = "Ed25519"
	CredentialIssuer    = "vantare-license"
	LaunchScopeV1       = "launch_v1"
)

type Capability string

const (
	CapabilityPro      Capability = "vantare.plan.pro"
	CapabilityLaunchV1 Capability = "vantare.edition.launch_v1"
	CapabilityTesters  Capability = "vantare.channel.testers"
	CapabilityNightly  Capability = "vantare.channel.nightly"
)

var knownCapabilities = map[Capability]struct{}{
	CapabilityPro: {}, CapabilityLaunchV1: {}, CapabilityTesters: {}, CapabilityNightly: {},
}

// OfflineCapability keeps independent commercial sources independent: a
// lifetime Launch grant must not make a temporary Pro Plus channel perpetual.
type OfflineCapability struct {
	Key          Capability `json:"key"`
	PaidThrough  string     `json:"paid_through,omitempty"`
	Perpetual    bool       `json:"perpetual,omitempty"`
	ScopeVersion string     `json:"scope_version,omitempty"`
}

type CredentialClaims struct {
	Issuer            string              `json:"issuer"`
	Subject           string              `json:"subject"`
	DeviceFingerprint string              `json:"device_fingerprint"`
	IssuedAt          string              `json:"issued_at"`
	Capabilities      []OfflineCapability `json:"capabilities"`
}

type OfflineCredential struct {
	Version   int              `json:"version"`
	Algorithm string           `json:"algorithm"`
	KeyID     string           `json:"key_id"`
	Claims    CredentialClaims `json:"claims"`
	Signature string           `json:"signature"`
}

type CredentialResponse struct {
	Credential         OfflineCredential `json:"credential"`
	OnlineCapabilities []Capability      `json:"online_capabilities"`
}

type credentialSigningPayload struct {
	Version   int              `json:"version"`
	Algorithm string           `json:"algorithm"`
	KeyID     string           `json:"key_id"`
	Claims    CredentialClaims `json:"claims"`
}

func (c OfflineCredential) signingBytes() ([]byte, error) {
	return json.Marshal(credentialSigningPayload{
		Version: c.Version, Algorithm: c.Algorithm, KeyID: c.KeyID, Claims: c.Claims,
	})
}

type ClockState struct {
	LastSeenAt     time.Time `json:"last_seen_at"`
	LatestIssuedAt time.Time `json:"latest_issued_at"`
}

type ClockStore interface {
	Load() (ClockState, error)
	Save(ClockState) error
}

type CredentialVerifier struct {
	keys    map[string]ed25519.PublicKey
	clock   ClockStore
	clockMu sync.Mutex
	now     func() time.Time
}

func NewCredentialVerifier(keys map[string]ed25519.PublicKey, clock ClockStore) *CredentialVerifier {
	copyKeys := make(map[string]ed25519.PublicKey, len(keys))
	for keyID, key := range keys {
		copyKeys[keyID] = append(ed25519.PublicKey(nil), key...)
	}
	return &CredentialVerifier{keys: copyKeys, clock: clock, now: time.Now}
}

func (v *CredentialVerifier) verifyOnline(c *OfflineCredential, expectedSubject, expectedDevice string) (*Result, error) {
	return v.verify(c, expectedSubject, expectedDevice, true)
}

func (v *CredentialVerifier) verifyCached(c *OfflineCredential, expectedSubject, expectedDevice string) (*Result, error) {
	return v.verify(c, expectedSubject, expectedDevice, false)
}

func (v *CredentialVerifier) verify(c *OfflineCredential, expectedSubject, expectedDevice string, online bool) (*Result, error) {
	if c == nil {
		return nil, ErrInvalidCredential
	}
	if c.Version != CredentialVersion || c.Algorithm != CredentialAlgorithm || strings.TrimSpace(c.KeyID) == "" {
		return nil, ErrInvalidCredential
	}
	key, ok := v.keys[c.KeyID]
	if !ok || len(key) != ed25519.PublicKeySize {
		return nil, ErrUnknownSigningKey
	}
	signature, err := base64.RawURLEncoding.DecodeString(c.Signature)
	if err != nil || len(signature) != ed25519.SignatureSize {
		return nil, ErrInvalidCredential
	}
	payload, err := c.signingBytes()
	if err != nil || !ed25519.Verify(key, payload, signature) {
		return nil, ErrInvalidCredential
	}
	if c.Claims.Issuer != CredentialIssuer || !isUUID(c.Claims.Subject) || c.Claims.Subject != expectedSubject {
		return nil, ErrCredentialAccountMismatch
	}
	if c.Claims.DeviceFingerprint == "" || c.Claims.DeviceFingerprint != expectedDevice {
		return nil, ErrCredentialDeviceMismatch
	}
	issuedAt, err := time.Parse(time.RFC3339Nano, c.Claims.IssuedAt)
	if err != nil {
		return nil, ErrInvalidCredential
	}
	now := v.now().UTC()
	const skew = 5 * time.Minute
	if !online && issuedAt.After(now.Add(skew)) {
		return nil, ErrInvalidCredential
	}
	if online {
		// The authenticated issuer's signed timestamp is the clock authority for
		// this response. This lets a legitimate online validation recover from a
		// local clock jump without extending grants using an incorrect local time.
		now = issuedAt
	}
	active := make([]Capability, 0, len(c.Claims.Capabilities))
	lastKey := Capability("")
	for _, grant := range c.Claims.Capabilities {
		if _, ok := knownCapabilities[grant.Key]; !ok || grant.Key <= lastKey {
			return nil, ErrInvalidCredential
		}
		lastKey = grant.Key
		if grant.Perpetual {
			if grant.PaidThrough != "" {
				return nil, ErrInvalidCredential
			}
			switch grant.Key {
			case CapabilityLaunchV1:
				if grant.ScopeVersion != LaunchScopeV1 {
					return nil, ErrInvalidCredential
				}
			case CapabilityTesters:
				if grant.ScopeVersion != "" {
					return nil, ErrInvalidCredential
				}
			default:
				return nil, ErrInvalidCredential
			}
			active = append(active, grant.Key)
			continue
		}
		if grant.Key == CapabilityLaunchV1 || grant.ScopeVersion != "" || grant.PaidThrough == "" {
			return nil, ErrInvalidCredential
		}
		paidThrough, parseErr := time.Parse(time.RFC3339Nano, grant.PaidThrough)
		if parseErr != nil {
			return nil, ErrInvalidCredential
		}
		if paidThrough.After(now) {
			active = append(active, grant.Key)
		}
	}
	if err := v.checkAndAdvanceClock(now, issuedAt, skew, online); err != nil {
		return nil, err
	}

	res := &Result{
		State: StateExpired, UserID: c.Claims.Subject, DeviceOK: true,
		Capabilities: active, LastValidated: now,
	}
	if len(c.Claims.Capabilities) == 0 {
		res.State = StateAuthenticatedNoEntitlement
	} else if len(active) > 0 {
		res.State = StateActive
	}
	res.Entitlements = legacyEntitlements(active)
	return res, nil
}

func (v *CredentialVerifier) checkAndAdvanceClock(now, issuedAt time.Time, skew time.Duration, online bool) error {
	v.clockMu.Lock()
	defer v.clockMu.Unlock()

	if v.clock == nil {
		return ErrSecureClockUnavailable
	}
	state, err := v.clock.Load()
	if errors.Is(err, ErrClockStateNotFound) {
		if !online {
			return ErrSecureClockUnavailable
		}
		state = ClockState{}
	} else if err != nil {
		return fmt.Errorf("%w: %w", ErrSecureClockUnavailable, err)
	}
	if issuedAt.Add(skew).Before(state.LatestIssuedAt) {
		return ErrClockRollback
	}
	clockRolledBack := now.Add(skew).Before(state.LastSeenAt)
	if clockRolledBack && !online {
		return ErrClockRollback
	}
	if clockRolledBack {
		state.LastSeenAt = issuedAt
		if state.LatestIssuedAt.After(state.LastSeenAt) {
			state.LastSeenAt = state.LatestIssuedAt
		}
	} else if now.After(state.LastSeenAt) {
		state.LastSeenAt = now
	}
	if issuedAt.After(state.LatestIssuedAt) {
		state.LatestIssuedAt = issuedAt
	}
	if err := v.clock.Save(state); err != nil {
		return fmt.Errorf("%w: %w", ErrSecureClockUnavailable, err)
	}
	return nil
}

func legacyEntitlements(capabilities []Capability) []Entitlement {
	for _, capability := range capabilities {
		if capability == CapabilityPro || capability == CapabilityLaunchV1 {
			return []Entitlement{EntitlementBundle}
		}
	}
	return nil
}

func isUUID(value string) bool {
	if len(value) != 36 {
		return false
	}
	for index, char := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			if char != '-' {
				return false
			}
			continue
		}
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F')) {
			return false
		}
	}
	return true
}

func ParsePublicKeys(raw string) (map[string]ed25519.PublicKey, error) {
	keys := map[string]ed25519.PublicKey{}
	if strings.TrimSpace(raw) == "" {
		return keys, nil
	}
	for _, entry := range strings.Split(raw, ",") {
		parts := strings.SplitN(strings.TrimSpace(entry), ":", 2)
		if len(parts) != 2 || parts[0] == "" {
			return nil, fmt.Errorf("invalid license public key entry")
		}
		decoded, err := base64.RawURLEncoding.DecodeString(parts[1])
		if err != nil || len(decoded) != ed25519.PublicKeySize {
			return nil, fmt.Errorf("invalid license public key %q", parts[0])
		}
		if _, exists := keys[parts[0]]; exists {
			return nil, fmt.Errorf("duplicate license public key %q", parts[0])
		}
		keys[parts[0]] = ed25519.PublicKey(decoded)
	}
	return keys, nil
}

func SortedCapabilities(values []Capability) []Capability {
	out := append([]Capability(nil), values...)
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}
