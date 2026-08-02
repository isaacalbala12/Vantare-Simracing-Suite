package license

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"sync"
	"testing"
	"time"
)

type orderedClock struct {
	mu               sync.Mutex
	state            ClockState
	saveCalls        int
	firstSaveStarted chan struct{}
	allowFirstSave   chan struct{}
	secondSaveDone   chan struct{}
}

func newOrderedClock() *orderedClock {
	return &orderedClock{
		firstSaveStarted: make(chan struct{}),
		allowFirstSave:   make(chan struct{}),
		secondSaveDone:   make(chan struct{}),
	}
}

func (c *orderedClock) Load() (ClockState, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.saveCalls == 0 {
		return ClockState{}, ErrClockStateNotFound
	}
	return c.state, nil
}

func (c *orderedClock) Save(state ClockState) error {
	c.mu.Lock()
	c.saveCalls++
	call := c.saveCalls
	c.mu.Unlock()
	if call == 1 {
		close(c.firstSaveStarted)
		<-c.allowFirstSave
	}
	c.mu.Lock()
	c.state = state
	c.mu.Unlock()
	if call == 2 {
		close(c.secondSaveDone)
	}
	return nil
}

func TestCredentialEditAndRollbackAreDetected(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	public, private, _ := ed25519.GenerateKey(nil)
	clock := &memoryClock{}
	verifier := NewCredentialVerifier(map[string]ed25519.PublicKey{"test-key": public}, clock)
	verifier.now = func() time.Time { return now }
	credential := signTestCredential(t, private, now, []OfflineCapability{{Key: CapabilityPro, PaidThrough: now.Add(time.Hour).Format(time.RFC3339)}}, testSubject, "device-1")
	credential.Claims.Capabilities[0].PaidThrough = now.Add(24 * time.Hour).Format(time.RFC3339)
	if _, err := verifier.verifyCached(credential, testSubject, "device-1"); !errors.Is(err, ErrInvalidCredential) {
		t.Fatalf("edit error = %v", err)
	}
	credential = signTestCredential(t, private, now, []OfflineCapability{{Key: CapabilityPro, PaidThrough: now.Add(time.Hour).Format(time.RFC3339)}}, testSubject, "device-1")
	if _, err := verifier.verifyOnline(credential, testSubject, "device-1"); err != nil {
		t.Fatal(err)
	}
	clock.state.LastSeenAt = now.Add(time.Hour)
	verifier.now = func() time.Time { return now.Add(-time.Minute) }
	if _, err := verifier.verifyCached(credential, testSubject, "device-1"); !errors.Is(err, ErrClockRollback) {
		t.Fatalf("clock rollback = %v", err)
	}
}

func TestCredentialRejectsOlderSignedLease(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	public, private, _ := ed25519.GenerateKey(nil)
	clock := &memoryClock{found: true, state: ClockState{LastSeenAt: now, LatestIssuedAt: now}}
	verifier := NewCredentialVerifier(map[string]ed25519.PublicKey{"test-key": public}, clock)
	verifier.now = func() time.Time { return now }
	older := signTestCredential(t, private, now.Add(-10*time.Minute), []OfflineCapability{{Key: CapabilityLaunchV1, Perpetual: true, ScopeVersion: LaunchScopeV1}}, testSubject, "device-1")
	if _, err := verifier.verifyCached(older, testSubject, "device-1"); !errors.Is(err, ErrClockRollback) {
		t.Fatalf("credential rollback = %v", err)
	}
}

func TestCredentialHighWatermarkCannotRegressDuringConcurrentValidation(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	public, private, _ := ed25519.GenerateKey(nil)
	clock := newOrderedClock()
	verifier := NewCredentialVerifier(map[string]ed25519.PublicKey{"test-key": public}, clock)
	verifier.now = func() time.Time { return now }
	older := signTestCredential(t, private, now.Add(-time.Minute), nil, testSubject, "device-1")
	newer := signTestCredential(t, private, now, nil, testSubject, "device-1")

	var wg sync.WaitGroup
	errorsByCredential := make(chan error, 2)
	wg.Add(1)
	go func() {
		defer wg.Done()
		_, err := verifier.verifyOnline(older, testSubject, "device-1")
		errorsByCredential <- err
	}()
	<-clock.firstSaveStarted
	wg.Add(1)
	go func() {
		defer wg.Done()
		_, err := verifier.verifyOnline(newer, testSubject, "device-1")
		errorsByCredential <- err
	}()

	select {
	case <-clock.secondSaveDone:
		close(clock.allowFirstSave)
	case <-time.After(100 * time.Millisecond):
		close(clock.allowFirstSave)
	}
	wg.Wait()
	close(errorsByCredential)
	for err := range errorsByCredential {
		if err != nil {
			t.Fatalf("verify error = %v", err)
		}
	}
	state, err := clock.Load()
	if err != nil {
		t.Fatal(err)
	}
	if !state.LatestIssuedAt.Equal(now) {
		t.Fatalf("latest issued at regressed to %s", state.LatestIssuedAt)
	}
}

func TestCredentialInvalidClaimsDoNotAdvanceHighWatermark(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	public, private, _ := ed25519.GenerateKey(nil)
	clock := &memoryClock{}
	verifier := NewCredentialVerifier(map[string]ed25519.PublicKey{"test-key": public}, clock)
	verifier.now = func() time.Time { return now }
	credential := signTestCredential(t, private, now, []OfflineCapability{
		{Key: CapabilityPro, Perpetual: true},
	}, testSubject, "device-1")

	if _, err := verifier.verifyOnline(credential, testSubject, "device-1"); !errors.Is(err, ErrInvalidCredential) {
		t.Fatalf("verify error = %v", err)
	}
	if clock.found {
		t.Fatal("invalid claims advanced the protected high-watermark")
	}
}

func TestCredentialVerifiesDenoWebCryptoFixture(t *testing.T) {
	// This fixture was produced by the Edge issuer's WebCrypto path. It contains
	// only public verification material and locks the cross-runtime JSON order.
	publicKey, err := base64.RawURLEncoding.DecodeString("Q-nKPagJl0p0ekgKA_S6xy7W8b-aEaGtxWJujC83WRY")
	if err != nil {
		t.Fatal(err)
	}
	credential := &OfflineCredential{
		Version: CredentialVersion, Algorithm: CredentialAlgorithm, KeyID: "interop-2026-08",
		Claims: CredentialClaims{
			Issuer: CredentialIssuer, Subject: testSubject,
			DeviceFingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			IssuedAt:          "2026-08-02T12:00:00.000Z",
			Capabilities: []OfflineCapability{
				{Key: CapabilityTesters, Perpetual: true},
				{Key: CapabilityLaunchV1, Perpetual: true, ScopeVersion: LaunchScopeV1},
				{Key: CapabilityPro, PaidThrough: "2026-09-02T12:00:00.000Z"},
			},
		},
		Signature: "byQ-Z8-Q5Qhx-SoNBfm42PaKn_ObSAzeWrbd6zbvSdm9w8Bool7xJpkld4H4D6jkAFsBrJr9GwfW7cnynGepBQ",
	}
	verifier := NewCredentialVerifier(
		map[string]ed25519.PublicKey{"interop-2026-08": publicKey},
		&memoryClock{},
	)
	verifier.now = func() time.Time { return time.Date(2026, 8, 2, 12, 1, 0, 0, time.UTC) }

	result, err := verifier.verifyOnline(
		credential,
		testSubject,
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	)
	if err != nil {
		t.Fatalf("verify Deno fixture: %v", err)
	}
	if result.State != StateActive || len(result.Capabilities) != 3 {
		t.Fatalf("result = %#v", result)
	}
}

func TestParsePublicKeys(t *testing.T) {
	public, _, _ := ed25519.GenerateKey(nil)
	raw := "current:" + base64.RawURLEncoding.EncodeToString(public)
	keys, err := ParsePublicKeys(raw)
	if err != nil || len(keys["current"]) != ed25519.PublicKeySize {
		t.Fatalf("keys = %v, %v", keys, err)
	}
	if _, err := ParsePublicKeys("broken"); err == nil {
		t.Fatal("expected invalid entry")
	}
}
