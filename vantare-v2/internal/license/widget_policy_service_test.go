package license

import (
	"context"
	"sync"
	"testing"
	"time"
)

func policyWiresByName(f *fakeEmitter, name string) []WidgetPolicyWire {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []WidgetPolicyWire
	for i, event := range f.names {
		if event != name {
			continue
		}
		wire, ok := f.data[i].(WidgetPolicyWire)
		if !ok {
			continue
		}
		out = append(out, wire)
	}
	return out
}

func emitSuiteBundle(svc *Service) {
	svc.EmitChanged(&Result{State: StateActive, Entitlements: []Entitlement{EntitlementBundle}})
}

func TestWidgetPolicyRevisionStableAcrossSnapshots(t *testing.T) {
	svc := &Service{}
	defer svc.stopPolicyTimer()
	emitSuiteBundle(svc)
	first := svc.CurrentWidgetPolicy()
	second := svc.CurrentWidgetPolicy()
	if first.Revision == 0 {
		t.Fatal("published policy must carry a non-zero revision")
	}
	if first != second {
		t.Fatalf("repeated snapshot unstable: %+v vs %+v", first, second)
	}
}

func TestWidgetPolicyRevisionAdvancesOnEffectiveChange(t *testing.T) {
	svc := &Service{}
	defer svc.stopPolicyTimer()
	emitSuiteBundle(svc)
	suiteRevision := svc.CurrentWidgetPolicy().Revision
	svc.EmitChanged(&Result{State: StateAuthenticatedNoEntitlement})
	freeRevision := svc.CurrentWidgetPolicy().Revision
	if freeRevision <= suiteRevision {
		t.Fatalf("revision must advance on effective change: %d -> %d", suiteRevision, freeRevision)
	}
	if svc.CurrentWidgetPolicy().OverlaysAdvanced {
		t.Fatal("free snapshot must not keep premium")
	}
}

func TestWidgetPolicyLogoutPublishesFreeExplicitly(t *testing.T) {
	emitter := &fakeEmitter{}
	svc := NewService(Config{}, emitter, nil)
	defer svc.stopPolicyTimer()
	emitSuiteBundle(svc)
	before := svc.CurrentWidgetPolicy().Revision
	svc.ClearCurrent()
	after := svc.CurrentWidgetPolicy()
	if after.OverlaysAdvanced || after.EngineerAI {
		t.Fatalf("logout snapshot = %+v, want free", after)
	}
	if after.BrandCrystal != BrandRequired {
		t.Fatalf("logout brand = %q, want required", after.BrandCrystal)
	}
	if after.Revision <= before {
		t.Fatalf("logout must advance the sequence: %d -> %d", before, after.Revision)
	}
	wires := policyWiresByName(emitter, WidgetPolicyChangedEvent)
	if len(wires) == 0 {
		t.Fatal("logout must emit an explicit free policy event")
	}
	last := wires[len(wires)-1]
	if last.Revision != after.Revision || last.OverlaysAdvanced {
		t.Fatalf("last policy event = %+v, want the free snapshot", last)
	}
}

func TestWidgetPolicyInconclusiveAnonymousKeepsCurrent(t *testing.T) {
	emitter := &fakeEmitter{}
	svc := NewService(Config{}, emitter, nil)
	defer svc.stopPolicyTimer()
	svc.EmitChanged(&Result{
		State:            StateActive,
		Capabilities:     []Capability{CapabilityOperationalOwner},
		OperationalRoles: []OperationalRole{OperationalRoleOwner},
	})
	before := svc.CurrentWidgetPolicy()
	eventsBefore := len(policyWiresByName(emitter, WidgetPolicyChangedEvent))
	svc.EmitChanged(&Result{State: StateAnonymous, Error: ErrMissingSession})
	after := svc.CurrentWidgetPolicy()
	if after != before {
		t.Fatalf("inconclusive anonymous changed policy: %+v -> %+v", before, after)
	}
	if got := len(policyWiresByName(emitter, WidgetPolicyChangedEvent)); got != eventsBefore {
		t.Fatalf("inconclusive anonymous emitted %d policy events, want %d", got, eventsBefore)
	}
}

func TestWidgetPolicyConclusiveAnonymousReplacesCurrent(t *testing.T) {
	svc := &Service{}
	defer svc.stopPolicyTimer()
	svc.EmitChanged(&Result{State: StateActive, Entitlements: []Entitlement{EntitlementBundle}})
	before := svc.CurrentWidgetPolicy().Revision
	svc.EmitChanged(&Result{State: StateAnonymous, Error: ErrValidationFailed})
	after := svc.CurrentWidgetPolicy()
	if after.OverlaysAdvanced {
		t.Fatalf("conclusive anonymous must drop premium: %+v", after)
	}
	if after.Revision <= before {
		t.Fatalf("conclusive anonymous must advance the sequence: %d -> %d", before, after.Revision)
	}
}

func TestWidgetPolicySnapshotCopiesAuthority(t *testing.T) {
	svc := &Service{}
	defer svc.stopPolicyTimer()
	caps := []Capability{CapabilityPro}
	res := &Result{State: StateActive, Capabilities: caps}
	svc.EmitChanged(res)
	caps[0] = CapabilityTesters
	res.State = StateExpired
	snapshot := svc.CurrentWidgetPolicy()
	if !snapshot.OverlaysAdvanced {
		t.Fatalf("mutating the emitted input must not change the snapshot: %+v", snapshot)
	}
}

func TestWidgetPolicyExpiryRecalculatesNativelyWithControlledClock(t *testing.T) {
	now := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	svc := &Service{}
	svc.policyNow = func() time.Time { return now }
	defer svc.stopPolicyTimer()
	emitter := &fakeEmitter{}
	svc.WithEmitter(emitter)
	deadline := now.Add(time.Hour)
	svc.EmitChanged(&Result{
		State:          StateActive,
		Capabilities:   []Capability{CapabilityPro},
		Entitlements:   []Entitlement{EntitlementBundle},
		VerifiedGrants: []VerifiedGrant{{Key: CapabilityPro, ExpiresAt: deadline}},
	})
	before := svc.CurrentWidgetPolicy()
	if !before.OverlaysAdvanced {
		t.Fatalf("before deadline must keep premium: %+v", before)
	}
	now = deadline.Add(time.Minute)
	after := svc.refreshWidgetPolicy()
	if after.OverlaysAdvanced || after.EngineerAI {
		t.Fatalf("after deadline must lose premium without network: %+v", after)
	}
	if after.BrandCrystal != BrandRequired {
		t.Fatalf("after deadline brand = %q, want required", after.BrandCrystal)
	}
	if after.Revision <= before.Revision {
		t.Fatalf("expiry must advance the sequence: %d -> %d", before.Revision, after.Revision)
	}
	if !after.ValidUntil.IsZero() {
		t.Fatalf("after deadline validUntil = %v, want zero", after.ValidUntil)
	}
}

func TestWidgetPolicyLaunchPerpetualSurvivesProExpiryOnService(t *testing.T) {
	now := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	svc := &Service{}
	svc.policyNow = func() time.Time { return now }
	defer svc.stopPolicyTimer()
	deadline := now.Add(time.Hour)
	svc.EmitChanged(&Result{
		State:        StateActive,
		Capabilities: []Capability{CapabilityLaunchV1, CapabilityPro},
		VerifiedGrants: []VerifiedGrant{
			{Key: CapabilityLaunchV1, Perpetual: true},
			{Key: CapabilityPro, ExpiresAt: deadline},
		},
	})
	now = deadline.Add(time.Minute)
	after := svc.refreshWidgetPolicy()
	if !after.OverlaysAdvanced || !after.EngineerAI {
		t.Fatalf("launch perpetual must survive pro expiry: %+v", after)
	}
	if after.BrandCrystal != BrandOptional {
		t.Fatalf("launch brand = %q, want optional", after.BrandCrystal)
	}
	if !after.ValidUntil.IsZero() {
		t.Fatalf("validUntil = %v, want zero when the deadline changes nothing", after.ValidUntil)
	}
	svc.policyMu.Lock()
	pending := svc.policyTimer != nil
	svc.policyMu.Unlock()
	if pending {
		t.Fatal("no native wakeup may be scheduled for a deadline that changes nothing")
	}
}

func TestWidgetPolicyCacheIsNotRereadToRestoreAfterLogout(t *testing.T) {
	now := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	client := &mockSupabaseClient{}
	svc, private := newTestService(t, now, client)
	svc.WithCache(NewLicenseCache(t.TempDir() + "/license.json"))
	// Controlled policy clock: the credential deadline is relative to the
	// fixed test instant, and the real clock must not decide this test.
	svc.policyNow = func() time.Time { return now }
	emitter := &fakeEmitter{}
	svc.WithEmitter(emitter)
	defer svc.stopPolicyTimer()
	client.credential = signTestCredential(t, private, now, []OfflineCapability{
		{Key: CapabilityOperationalOwner, PaidThrough: now.Add(time.Hour).Format(time.RFC3339Nano)},
	}, testSubject, "device-1")
	if _, err := svc.Validate(context.Background(), testJWT(testSubject)); err != nil {
		t.Fatal(err)
	}
	if !svc.CurrentWidgetPolicy().OverlaysAdvanced {
		t.Fatal("online validation must grant premium before logout")
	}
	svc.ClearCurrent()
	if svc.CurrentWidgetPolicy().OverlaysAdvanced {
		t.Fatal("logout must drop premium")
	}
	svc.EmitCachedState()
	if svc.CurrentWidgetPolicy().OverlaysAdvanced {
		t.Fatal("cached credential must not restore authority after logout")
	}
	if _, err := svc.Validate(context.Background(), testJWT(testSubject)); err != nil {
		t.Fatal(err)
	}
	if !svc.CurrentWidgetPolicy().OverlaysAdvanced {
		t.Fatal("a new online validation must restore authority after logout")
	}
}

func TestWidgetPolicyLogoutStopsTimerAndStaysFree(t *testing.T) {
	now := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	svc := &Service{}
	svc.policyNow = func() time.Time { return now }
	emitter := &fakeEmitter{}
	svc.WithEmitter(emitter)
	deadline := now.Add(time.Hour)
	svc.EmitChanged(&Result{
		State:          StateActive,
		Capabilities:   []Capability{CapabilityPro},
		Entitlements:   []Entitlement{EntitlementBundle},
		VerifiedGrants: []VerifiedGrant{{Key: CapabilityPro, ExpiresAt: deadline}},
	})
	svc.policyMu.Lock()
	scheduled := svc.policyTimer != nil
	svc.policyMu.Unlock()
	if !scheduled {
		t.Fatal("premium with a future deadline must schedule the native transition")
	}
	before := svc.CurrentWidgetPolicy().Revision
	svc.ClearCurrent()
	after := svc.CurrentWidgetPolicy()
	if after.OverlaysAdvanced || after.EngineerAI || after.BrandCrystal != BrandRequired {
		t.Fatalf("after logout = %+v, want free", after)
	}
	if after.Revision <= before {
		t.Fatalf("logout must advance the sequence: %d -> %d", before, after.Revision)
	}
	svc.policyMu.Lock()
	pending := svc.policyTimer != nil
	svc.policyMu.Unlock()
	if pending {
		t.Fatal("logout must stop the pending native transition")
	}
	// A later snapshot with no authority behind it stays on the free
	// sequence instead of resurrecting premium.
	again := svc.refreshWidgetPolicy()
	if again != after {
		t.Fatalf("post-logout snapshot unstable: %+v vs %+v", after, again)
	}
}

func TestConclusiveAnonymousDoesNotUnlockCacheAfterLogout(t *testing.T) {
	now := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	client := &mockSupabaseClient{}
	svc, private := newTestService(t, now, client)
	svc.WithCache(NewLicenseCache(t.TempDir() + "/license.json"))
	svc.policyNow = func() time.Time { return now }
	emitter := &fakeEmitter{}
	svc.WithEmitter(emitter)
	defer svc.stopPolicyTimer()
	client.credential = signTestCredential(t, private, now, []OfflineCapability{
		{Key: CapabilityPro, PaidThrough: now.Add(time.Hour).Format(time.RFC3339Nano)},
	}, testSubject, "device-1")
	if _, err := svc.Validate(context.Background(), testJWT(testSubject)); err != nil {
		t.Fatal(err)
	}
	svc.ClearCurrent()
	// A failed validation answers anonymous without a subject: it replaces
	// current but must never re-arm cache restores after logout.
	svc.EmitChanged(&Result{State: StateAnonymous, Error: ErrValidationFailed})
	eventsBefore := len(policyWiresByName(emitter, WidgetPolicyChangedEvent))
	svc.EmitCachedState()
	if svc.CurrentWidgetPolicy().OverlaysAdvanced {
		t.Fatal("anonymous validation must not unlock the cache after logout")
	}
	if got := len(policyWiresByName(emitter, WidgetPolicyChangedEvent)); got != eventsBefore {
		t.Fatal("cache re-read after logout must stay silent")
	}
}

// Regression for the cache-restore race: EmitCachedState reads the logout
// guard, does disk I/O, and must commit atomically with a re-check, so a
// logout interleaved with the I/O drops the result instead of restoring
// premium without a login. Deterministic on fixed code: every commit either
// lands before the sequenced logout or is dropped by it.
func TestEmitCachedStateInterleavedWithLogoutNeverRestoresPremium(t *testing.T) {
	now := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	client := &mockSupabaseClient{}
	svc, private := newTestService(t, now, client)
	svc.WithCache(NewLicenseCache(t.TempDir() + "/license.json"))
	svc.policyNow = func() time.Time { return now }
	emitter := &fakeEmitter{}
	svc.WithEmitter(emitter)
	defer svc.stopPolicyTimer()
	client.credential = signTestCredential(t, private, now, []OfflineCapability{
		{Key: CapabilityPro, PaidThrough: now.Add(time.Hour).Format(time.RFC3339Nano)},
	}, testSubject, "device-1")
	if _, err := svc.Validate(context.Background(), testJWT(testSubject)); err != nil {
		t.Fatal(err)
	}
	if !svc.CurrentWidgetPolicy().OverlaysAdvanced {
		t.Fatal("online validation must grant premium before logout")
	}
	release := make(chan struct{})
	var wg sync.WaitGroup
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-release
			for i := 0; i < 50; i++ {
				svc.EmitCachedState()
			}
		}()
	}
	close(release)
	svc.ClearCurrent()
	wg.Wait()
	svc.ClearCurrent()
	final := svc.CurrentWidgetPolicy()
	if final.OverlaysAdvanced || final.EngineerAI {
		t.Fatalf("after logout = %+v, want free", final)
	}
	for _, wire := range policyWiresByName(emitter, WidgetPolicyChangedEvent) {
		if wire.OverlaysAdvanced && wire.Revision > final.Revision {
			t.Fatalf("premium restored after logout free %d: %+v", final.Revision, wire)
		}
	}
	eventsBefore := len(policyWiresByName(emitter, WidgetPolicyChangedEvent))
	svc.EmitCachedState()
	if got := len(policyWiresByName(emitter, WidgetPolicyChangedEvent)); got != eventsBefore {
		t.Fatal("cache re-read after logout must stay silent")
	}
	if svc.CurrentWidgetPolicy() != final {
		t.Fatal("post-logout snapshot must stay stable")
	}
}

// Regression for the publication race: the authority read and its
// publication are one critical section (policyMu -> currentMu), so a
// snapshot staged before logout can never publish pre-logout premium after
// the forced Free. The verdict is deterministic on fixed code: readers derive
// either the current authority (identical to published, silent) or Free after
// logout (identical to published, silent). Run with -race.
func TestWidgetPolicyLogoutInterleavedWithSnapshotsNeverResurrectsPremium(t *testing.T) {
	now := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	svc := &Service{}
	svc.policyNow = func() time.Time { return now }
	emitter := &fakeEmitter{}
	svc.WithEmitter(emitter)
	firstDeadline := now.Add(time.Hour)
	premium := func(deadline time.Time) *Result {
		return &Result{
			State:          StateActive,
			Capabilities:   []Capability{CapabilityPro},
			Entitlements:   []Entitlement{EntitlementBundle},
			VerifiedGrants: []VerifiedGrant{{Key: CapabilityPro, ExpiresAt: deadline}},
		}
	}
	svc.EmitChanged(premium(firstDeadline))
	release := make(chan struct{})
	var wg sync.WaitGroup
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-release
			for i := 0; i < 100; i++ {
				svc.CurrentWidgetPolicy()
				svc.refreshWidgetPolicy()
			}
		}()
	}
	close(release)
	svc.ClearCurrent()
	wg.Wait()
	freeRevision := svc.CurrentWidgetPolicy().Revision
	// A new authority after logout may grant premium again with a distinct
	// deadline; only that authority may publish premium past the logout.
	secondDeadline := now.Add(2 * time.Hour)
	svc.EmitChanged(premium(secondDeadline))
	wires := policyWiresByName(emitter, WidgetPolicyChangedEvent)
	if len(wires) != 3 {
		t.Fatalf("got %d policy events, want exactly 3 (premium, free, premium)", len(wires))
	}
	for _, wire := range wires {
		if !wire.OverlaysAdvanced {
			continue
		}
		validUntil, err := time.Parse(time.RFC3339Nano, wire.ValidUntil)
		if err != nil {
			t.Fatalf("premium wire has unparseable validUntil: %+v", wire)
		}
		if validUntil.Equal(firstDeadline) && wire.Revision > freeRevision {
			t.Fatalf("pre-logout premium published after logout free %d: %+v", freeRevision, wire)
		}
	}
}
