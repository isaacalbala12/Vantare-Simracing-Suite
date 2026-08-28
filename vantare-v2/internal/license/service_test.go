package license

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

const testSubject = "8ad4bc02-e460-4e36-89d5-7e63f11f4921"

type memoryClock struct {
	mu      sync.Mutex
	state   ClockState
	found   bool
	loadErr error
	saveErr error
}

func TestOperationalUpdateChannelAuthorization(t *testing.T) {
	tests := []struct {
		name         string
		capabilities []Capability
		testers      bool
		nightly      bool
	}{
		{name: "free"},
		{name: "tester", capabilities: []Capability{CapabilityOperationalTester}, testers: true},
		{name: "nightly tester", capabilities: []Capability{CapabilityOperationalNightlyTester}, testers: true, nightly: true},
		{name: "owner", capabilities: []Capability{CapabilityOperationalOwner}, testers: true, nightly: true},
		{name: "launch", capabilities: []Capability{CapabilityTesters}, testers: true},
		{name: "pro plus", capabilities: []Capability{CapabilityNightly}, testers: true, nightly: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service := NewService(Config{}, nil, nil)
			service.EmitChanged(&Result{State: StateActive, Capabilities: test.capabilities})
			if !service.AllowsUpdateChannel("stable") {
				t.Fatal("stable must always be allowed")
			}
			if got := service.AllowsUpdateChannel("testers"); got != test.testers {
				t.Fatalf("testers=%v, want %v", got, test.testers)
			}
			if got := service.AllowsUpdateChannel("nightly"); got != test.nightly {
				t.Fatalf("nightly=%v, want %v", got, test.nightly)
			}
			if service.AllowsUpdateChannel("prerelease") {
				t.Fatal("ambiguous prerelease channel must fail closed")
			}
		})
	}
}

func TestExpiredOperationalCredentialCannotAuthorizeAChannel(t *testing.T) {
	service := NewService(Config{}, nil, nil)
	service.EmitChanged(&Result{
		State:        StateExpired,
		Capabilities: []Capability{CapabilityOperationalOwner},
	})
	if service.AllowsUpdateChannel("nightly") {
		t.Fatal("expired owner capability authorized nightly")
	}
}

func (c *memoryClock) Load() (ClockState, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.loadErr != nil {
		return ClockState{}, c.loadErr
	}
	if !c.found {
		return ClockState{}, ErrClockStateNotFound
	}
	return c.state, nil
}

func (c *memoryClock) Save(state ClockState) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.saveErr != nil {
		return c.saveErr
	}
	c.state = state
	c.found = true
	return nil
}

type mockSupabaseClient struct {
	credential         *OfflineCredential
	onlineCapabilities []Capability
	fetchErr           error
	resetErr           error
	fetchCalls         int
	resetCalls         int
	lastFingerprint    string
}

func (m *mockSupabaseClient) FetchCredential(_ context.Context, _, fingerprint string) (*CredentialResponse, error) {
	m.fetchCalls++
	m.lastFingerprint = fingerprint
	if m.fetchErr != nil {
		return nil, m.fetchErr
	}
	if m.credential == nil {
		return nil, nil
	}
	return &CredentialResponse{
		Credential:         *m.credential,
		OnlineCapabilities: append([]Capability(nil), m.onlineCapabilities...),
	}, nil
}

func (m *mockSupabaseClient) ResetDevice(_ context.Context, _, fingerprint string) error {
	m.resetCalls++
	m.lastFingerprint = fingerprint
	return m.resetErr
}

func testJWT(subject string) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none"}`))
	payload, _ := json.Marshal(map[string]string{"sub": subject})
	return header + "." + base64.RawURLEncoding.EncodeToString(payload) + ".signature"
}

func TestSubjectFromJWTAllowsExternalIdentityButRejectsInvalidSubjects(t *testing.T) {
	if got, err := subjectFromJWT(testJWT("user_isa909_clerk")); err != nil || got != "user_isa909_clerk" {
		t.Fatalf("external subject = %q, %v", got, err)
	}
	for _, subject := range []string{"", "   ", strings.Repeat("x", 256)} {
		if _, err := subjectFromJWT(testJWT(subject)); err == nil {
			t.Fatalf("invalid subject %q was accepted", subject)
		}
	}
}

func signTestCredential(
	t *testing.T,
	private ed25519.PrivateKey,
	issuedAt time.Time,
	capabilities []OfflineCapability,
	subject string,
	device string,
) *OfflineCredential {
	t.Helper()
	capabilities = append([]OfflineCapability(nil), capabilities...)
	sort.Slice(capabilities, func(i, j int) bool { return capabilities[i].Key < capabilities[j].Key })
	credential := &OfflineCredential{
		Version: CredentialVersion, Algorithm: CredentialAlgorithm, KeyID: "test-key",
		Claims: CredentialClaims{
			Issuer: CredentialIssuer, Subject: subject, DeviceFingerprint: device,
			IssuedAt: issuedAt.UTC().Format(time.RFC3339Nano), Capabilities: capabilities,
		},
	}
	payload, err := credential.signingBytes()
	if err != nil {
		t.Fatal(err)
	}
	credential.Signature = base64.RawURLEncoding.EncodeToString(ed25519.Sign(private, payload))
	return credential
}

func newTestService(t *testing.T, now time.Time, client *mockSupabaseClient) (*Service, ed25519.PrivateKey) {
	t.Helper()
	public, private, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	verifier := NewCredentialVerifier(map[string]ed25519.PublicKey{"test-key": public}, &memoryClock{})
	verifier.now = func() time.Time { return now }
	service := NewService(Config{}, nil, func() (string, error) { return "device-1", nil }).WithVerifier(verifier)
	if client != nil {
		service.WithClient(client)
	}
	return service, private
}

func TestValidateOnlineStates(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name      string
		configure func(*mockSupabaseClient, ed25519.PrivateKey)
		wantState State
		wantErr   error
	}{
		{
			name: "active",
			configure: func(client *mockSupabaseClient, private ed25519.PrivateKey) {
				client.credential = signTestCredential(t, private, now, []OfflineCapability{{Key: CapabilityPro, PaidThrough: now.Add(time.Hour).Format(time.RFC3339)}}, testSubject, "device-1")
			},
			wantState: StateActive,
		},
		{
			name: "authenticated without entitlement",
			configure: func(client *mockSupabaseClient, private ed25519.PrivateKey) {
				client.credential = signTestCredential(t, private, now, nil, testSubject, "device-1")
			},
			wantState: StateAuthenticatedNoEntitlement,
		},
		{
			name: "device limit",
			configure: func(client *mockSupabaseClient, _ ed25519.PrivateKey) {
				client.fetchErr = ErrDeviceLimit
			},
			wantState: StateDeviceLimit,
			wantErr:   ErrDeviceLimit,
		},
		{
			name: "authoritative rejection",
			configure: func(client *mockSupabaseClient, _ ed25519.PrivateKey) {
				client.fetchErr = ErrCredentialRejected
			},
			wantState: StateAuthenticatedNoEntitlement,
			wantErr:   ErrCredentialRejected,
		},
		{
			name:      "empty response",
			configure: func(_ *mockSupabaseClient, _ ed25519.PrivateKey) {},
			wantState: StateAuthenticatedNoEntitlement,
			wantErr:   ErrValidationFailed,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			client := &mockSupabaseClient{}
			service, private := newTestService(t, now, client)
			tc.configure(client, private)
			result, err := service.Validate(context.Background(), testJWT(testSubject))
			if err != nil {
				t.Fatalf("Validate() error = %v", err)
			}
			if result.State != tc.wantState {
				t.Fatalf("state = %s, want %s", result.State, tc.wantState)
			}
			if tc.wantErr != nil && !errors.Is(result.Error, tc.wantErr) {
				t.Fatalf("result error = %v, want %v", result.Error, tc.wantErr)
			}
			if client.lastFingerprint != "device-1" {
				t.Fatalf("fingerprint = %q", client.lastFingerprint)
			}
		})
	}
}

func TestValidateClerkSessionUsesSignedInternalAccount(t *testing.T) {
	now := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	client := &mockSupabaseClient{}
	service, private := newTestService(t, now, client)
	client.credential = signTestCredential(t, private, now, []OfflineCapability{{
		Key: CapabilityPro, PaidThrough: now.Add(time.Hour).Format(time.RFC3339),
	}}, testSubject, "device-1")

	result, err := service.Validate(context.Background(), testJWT("user_isa909_clerk"))
	if err != nil {
		t.Fatal(err)
	}
	if result.State != StateActive || !result.OnlineValidated {
		t.Fatalf("result = %#v", result)
	}
	if result.UserID != testSubject {
		t.Fatalf("user ID = %q, want signed internal account %q", result.UserID, testSubject)
	}
}

func TestRejectedClerkSessionNeverFallsBackToTrustedCache(t *testing.T) {
	now := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	client := &mockSupabaseClient{fetchErr: ErrCredentialRejected}
	service, private := newTestService(t, now, client)
	cache := NewLicenseCache(t.TempDir() + "/license.json")
	credential := signTestCredential(t, private, now.Add(-time.Minute), []OfflineCapability{{
		Key: CapabilityPro, PaidThrough: now.Add(time.Hour).Format(time.RFC3339),
	}}, testSubject, "device-1")
	if err := cache.Write(credential); err != nil {
		t.Fatal(err)
	}
	service.WithCache(cache)
	token := testJWT("user_isa909_clerk")

	result, err := service.ValidateWithTrustedSession(context.Background(), token, token)
	if err != nil {
		t.Fatal(err)
	}
	if result.State != StateAuthenticatedNoEntitlement ||
		!errors.Is(result.Error, ErrCredentialRejected) {
		t.Fatalf("rejected session used offline cache: %#v", result)
	}
	if result.UserID != "" {
		t.Fatalf("external subject leaked as internal user ID: %q", result.UserID)
	}
}

func TestValidateOfflineFallbackRequiresExactTrustedSession(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	client := &mockSupabaseClient{fetchErr: errors.New("network unavailable")}
	service, private := newTestService(t, now, client)
	cache := NewLicenseCache(t.TempDir() + "/license.json")
	credential := signTestCredential(t, private, now.Add(-time.Minute), []OfflineCapability{{Key: CapabilityPro, PaidThrough: now.Add(time.Hour).Format(time.RFC3339)}}, testSubject, "device-1")
	if _, err := service.verifier.verifyOnline(credential, "device-1"); err != nil {
		t.Fatal(err)
	}
	if err := cache.Write(credential); err != nil {
		t.Fatal(err)
	}
	service.WithCache(cache)
	token := testJWT(testSubject)

	for _, tc := range []struct {
		name    string
		trusted string
		want    State
	}{
		{name: "no protected session", want: StateAuthenticatedNoEntitlement},
		{name: "different protected session", trusted: testJWT("00000000-0000-4000-8000-000000000002"), want: StateAuthenticatedNoEntitlement},
		{name: "exact protected session", trusted: token, want: StateGrace},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result, err := service.ValidateWithTrustedSession(context.Background(), token, tc.trusted)
			if err != nil {
				t.Fatal(err)
			}
			if result.State != tc.want {
				t.Fatalf("state = %s, want %s", result.State, tc.want)
			}
		})
	}
}

func TestValidateOfflineExpiredCredentialStaysExpired(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	service, private := newTestService(t, now, &mockSupabaseClient{fetchErr: errors.New("offline")})
	cache := NewLicenseCache(t.TempDir() + "/license.json")
	credential := signTestCredential(t, private, now.Add(-2*time.Hour), []OfflineCapability{{Key: CapabilityPro, PaidThrough: now.Add(-time.Hour).Format(time.RFC3339)}}, testSubject, "device-1")
	if _, err := service.verifier.verifyOnline(credential, "device-1"); err != nil {
		t.Fatal(err)
	}
	if err := cache.Write(credential); err != nil {
		t.Fatal(err)
	}
	service.WithCache(cache)
	token := testJWT(testSubject)
	result, err := service.ValidateWithTrustedSession(context.Background(), token, token)
	if err != nil {
		t.Fatal(err)
	}
	if result.State != StateExpired || len(result.Capabilities) != 0 {
		t.Fatalf("result = %#v", result)
	}
}

func TestValidateOnlineRevocationReplacesCachedPremiumCredential(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	client := &mockSupabaseClient{}
	service, private := newTestService(t, now, client)
	cache := NewLicenseCache(t.TempDir() + "/license.json")
	oldCredential := signTestCredential(t, private, now.Add(-time.Hour), []OfflineCapability{{Key: CapabilityPro, PaidThrough: now.Add(time.Hour).Format(time.RFC3339)}}, testSubject, "device-1")
	if err := cache.Write(oldCredential); err != nil {
		t.Fatal(err)
	}
	client.credential = signTestCredential(t, private, now, nil, testSubject, "device-1")
	service.WithCache(cache)

	result, err := service.Validate(context.Background(), testJWT(testSubject))
	if err != nil {
		t.Fatal(err)
	}
	if result.State != StateAuthenticatedNoEntitlement || !result.OnlineValidated {
		t.Fatalf("result = %#v", result)
	}
	cached, err := cache.Read()
	if err != nil {
		t.Fatal(err)
	}
	if len(cached.Claims.Capabilities) != 0 || cached.Claims.IssuedAt != client.credential.Claims.IssuedAt {
		t.Fatalf("cached credential was not replaced: %#v", cached)
	}
}

func TestValidateRejectsInvalidSessionAndFingerprintFailure(t *testing.T) {
	service := NewService(Config{}, nil, func() (string, error) { return "device-1", nil })
	result, err := service.Validate(context.Background(), "not-a-jwt")
	if err != nil || result.State != StateAnonymous || !errors.Is(result.Error, ErrValidationFailed) {
		t.Fatalf("invalid JWT result = %#v, %v", result, err)
	}

	service = NewService(Config{}, nil, func() (string, error) { return "", errors.New("fingerprint failed") })
	if _, err := service.Validate(context.Background(), testJWT(testSubject)); err == nil {
		t.Fatal("expected fingerprint error")
	}
}

func TestValidateUnconfiguredFailsClosedWithoutTrustedCache(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	service, _ := newTestService(t, now, nil)
	result, err := service.Validate(context.Background(), testJWT(testSubject))
	if err != nil || result.State != StateUnconfigured || !errors.Is(result.Error, ErrUnconfigured) {
		t.Fatalf("result = %#v, %v", result, err)
	}

	service.WithCache(NewLicenseCache(t.TempDir() + "/missing.json"))
	result, err = service.ValidateWithTrustedSession(context.Background(), testJWT(testSubject), testJWT(testSubject))
	if err != nil || result.State != StateUnconfigured || !errors.Is(result.Error, ErrUnconfigured) {
		t.Fatalf("missing cache result = %#v, %v", result, err)
	}
}

func TestValidateRejectsLegacyCacheForPremiumFallback(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	service, _ := newTestService(t, now, &mockSupabaseClient{fetchErr: errors.New("offline")})
	path := t.TempDir() + "/license.json"
	if err := os.WriteFile(path, []byte(`{"state":"active","entitlements":["bundle"]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	service.WithCache(NewLicenseCache(path))
	token := testJWT(testSubject)
	result, err := service.ValidateWithTrustedSession(context.Background(), token, token)
	if err != nil || result.State != StateAuthenticatedNoEntitlement || !errors.Is(result.Error, ErrLegacyCache) {
		t.Fatalf("result = %#v, %v", result, err)
	}
}

func TestMergeOnlineCapabilitiesValidatesAndSorts(t *testing.T) {
	result := &Result{State: StateActive, Capabilities: []Capability{CapabilityPro}}
	if err := mergeOnlineCapabilities(result, []Capability{CapabilityNightly, CapabilityTesters}); err != nil {
		t.Fatal(err)
	}
	want := []Capability{CapabilityNightly, CapabilityTesters, CapabilityPro}
	for i := range want {
		if result.Capabilities[i] != want[i] {
			t.Fatalf("capabilities = %v", result.Capabilities)
		}
	}
	if err := mergeOnlineCapabilities(result, []Capability{CapabilityTesters, CapabilityNightly}); !errors.Is(err, ErrInvalidCredential) {
		t.Fatalf("unsorted capabilities error = %v", err)
	}
	if err := mergeOnlineCapabilities(result, []Capability{"unknown"}); !errors.Is(err, ErrInvalidCredential) {
		t.Fatalf("unknown capability error = %v", err)
	}
}

func TestHasEntitlementAndResetDevice(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	client := &mockSupabaseClient{}
	service, private := newTestService(t, now, client)
	client.credential = signTestCredential(t, private, now, []OfflineCapability{{Key: CapabilityPro, PaidThrough: now.Add(time.Hour).Format(time.RFC3339)}}, testSubject, "device-1")
	token := testJWT(testSubject)

	got, err := service.HasEntitlement(context.Background(), token, EntitlementBundle)
	if err != nil || !got {
		t.Fatalf("HasEntitlement() = %v, %v", got, err)
	}
	if err := service.ResetDevice(context.Background(), token); err != nil {
		t.Fatal(err)
	}
	if client.resetCalls != 1 || client.lastFingerprint != "device-1" {
		t.Fatalf("reset calls = %d, fingerprint = %q", client.resetCalls, client.lastFingerprint)
	}
}

func TestResetDeviceValidatesInputsAndPropagatesFailure(t *testing.T) {
	service := NewService(Config{}, nil, func() (string, error) { return "device-1", nil })
	if err := service.ResetDevice(context.Background(), ""); !errors.Is(err, ErrMissingSession) {
		t.Fatalf("missing session error = %v", err)
	}
	if err := service.ResetDevice(context.Background(), testJWT(testSubject)); !errors.Is(err, ErrValidationFailed) {
		t.Fatalf("missing client error = %v", err)
	}
	client := &mockSupabaseClient{resetErr: errors.New("reset failed")}
	service.WithClient(client)
	if err := service.ResetDevice(context.Background(), testJWT(testSubject)); err == nil || err.Error() != "reset failed" {
		t.Fatalf("reset error = %v", err)
	}
}

// The frontend fires a tokenless validate on mount, before the stored session
// has been restored, and the answer is "nobody asked me about a session" -- not
// "your session is invalid". It used to overwrite the authenticated result, and
// with it the capabilities AllowsUpdateChannel reads: an owner saw the UI offer
// Nightly and the backend refuse it as "not authorized".
func TestTokenlessAnonymousDoesNotDemoteAnAuthenticatedOwner(t *testing.T) {
	svc := &Service{}
	svc.EmitChanged(&Result{
		State:            StateActive,
		Capabilities:     []Capability{CapabilityOperationalOwner},
		OperationalRoles: []OperationalRole{OperationalRoleOwner},
	})
	if !svc.AllowsUpdateChannel("nightly") {
		t.Fatal("an owner must be allowed on nightly")
	}

	svc.EmitChanged(&Result{State: StateAnonymous, Error: ErrMissingSession})

	if !svc.AllowsUpdateChannel("nightly") {
		t.Fatal("a tokenless anonymous must not take nightly away from an owner")
	}
	if !svc.AllowsUpdateChannel("testers") {
		t.Fatal("a tokenless anonymous must not take testers away from an owner")
	}
}

// Only the missing-session case is inconclusive. Any other anonymous is an
// answer about a session that was actually presented, and must be believed.
func TestAnonymousWithAnotherCauseStillReplacesTheCurrentResult(t *testing.T) {
	svc := &Service{}
	svc.EmitChanged(&Result{
		State:        StateActive,
		Capabilities: []Capability{CapabilityOperationalOwner},
	})

	svc.EmitChanged(&Result{State: StateAnonymous, Error: errors.New("session rejected")})

	if svc.AllowsUpdateChannel("nightly") {
		t.Fatal("a conclusive anonymous must drop the previous capabilities")
	}
}

func TestSigningOutDropsTheCapabilities(t *testing.T) {
	svc := &Service{}
	svc.EmitChanged(&Result{
		State:        StateActive,
		Capabilities: []Capability{CapabilityOperationalOwner},
	})

	svc.ClearCurrent()

	if svc.AllowsUpdateChannel("nightly") {
		t.Fatal("the capabilities of the account that just left must not outlive it")
	}
	// Stable is available to everyone, signed in or not.
	if !svc.AllowsUpdateChannel("stable") {
		t.Fatal("stable must stay available after signing out")
	}
}

// Nothing to protect yet: the very first result of a launch has to land.
func TestFirstResultIsStoredEvenWhenAnonymous(t *testing.T) {
	svc := &Service{}

	svc.EmitChanged(&Result{State: StateAnonymous, Error: ErrMissingSession})

	svc.currentMu.RLock()
	defer svc.currentMu.RUnlock()
	if svc.current == nil || svc.current.State != StateAnonymous {
		t.Fatalf("current = %+v, want the anonymous result", svc.current)
	}
}
