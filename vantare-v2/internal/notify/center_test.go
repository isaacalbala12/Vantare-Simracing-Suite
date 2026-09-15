package notify

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

type centerSpy struct {
	mu        sync.Mutex
	snapshots []Snapshot
	toasts    []string
}

func (s *centerSpy) emit(snap Snapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.snapshots = append(s.snapshots, snap)
}

func (s *centerSpy) toast(body string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.toasts = append(s.toasts, body)
}

func newTestCenter(t *testing.T) (*Center, *centerSpy) {
	t.Helper()
	spy := &centerSpy{}
	center := NewCenter(CenterOptions{
		Now:     func() time.Time { return time.UnixMilli(1700000000000) },
		Emit:    spy.emit,
		Muted:   func(Source) bool { return false },
		Windows: spy.toast,
	})
	return center, spy
}

func validRecord(source Source, key string) Record {
	return Record{
		Source:    source,
		Severity:  SeverityInfo,
		DedupeKey: key,
		TitleKey:  "notifications.record.test.title",
		Fallback:  "toast body",
	}
}

func TestCenterPublishStoresNewRecordAndEmits(t *testing.T) {
	center, spy := newTestCenter(t)
	rec := validRecord(SourceUpdater, "updater:update:v1")
	rec.Params = map[string]string{"tag": "v1"}
	rec.Action = &Action{Kind: "navigate", Target: "settings:updates"}

	if err := center.Publish(rec); err != nil {
		t.Fatal(err)
	}
	snap := center.Snapshot()
	if snap.V != CenterContractVersion || snap.Revision != 1 || len(snap.Records) != 1 || snap.Unread != 1 {
		t.Fatalf("snapshot = %+v", snap)
	}
	stored := snap.Records[0]
	if stored.ID == "" || stored.OccurredAt != 1700000000000 || !stored.Unread || stored.V != CenterContractVersion {
		t.Fatalf("stored record = %+v", stored)
	}
	if len(spy.snapshots) != 1 || len(spy.toasts) != 1 {
		t.Fatalf("emit=%d toasts=%d, want 1/1", len(spy.snapshots), len(spy.toasts))
	}
}

// Same dedupeKey + same signature is a repetition: the entry updates its
// last-seen time but stays read/unread as it was and raises no toast.
func TestCenterPublishRepetitionDoesNotRealert(t *testing.T) {
	center, spy := newTestCenter(t)
	rec := validRecord(SourceUpdater, "updater:update:v1")
	if err := center.Publish(rec); err != nil {
		t.Fatal(err)
	}
	center.MarkRead("all")

	later := func() time.Time { return time.UnixMilli(1700000000001) }
	center.opts.Now = later
	if err := center.Publish(rec); err != nil {
		t.Fatal(err)
	}

	snap := center.Snapshot()
	if len(snap.Records) != 1 {
		t.Fatalf("repetition duplicated the record: %+v", snap.Records)
	}
	if snap.Records[0].Unread {
		t.Fatal("repetition re-flagged a read record as unread")
	}
	if snap.Records[0].OccurredAt != 1700000000001 {
		t.Fatal("repetition did not refresh last-seen")
	}
	if len(spy.toasts) != 1 {
		t.Fatalf("repetition raised another toast: %d", len(spy.toasts))
	}
}

// Same dedupeKey with a different signature is a NEW occurrence: resurfaces
// unread, moves to front, toasts again.
func TestCenterPublishChangedSignatureIsNewOccurrence(t *testing.T) {
	center, spy := newTestCenter(t)
	rec := validRecord(SourceUpdater, "updater:update")
	rec.Params = map[string]string{"tag": "v1"}
	if err := center.Publish(rec); err != nil {
		t.Fatal(err)
	}
	center.MarkRead("all")

	rec.Params = map[string]string{"tag": "v2"}
	if err := center.Publish(rec); err != nil {
		t.Fatal(err)
	}
	snap := center.Snapshot()
	if len(snap.Records) != 1 || !snap.Records[0].Unread || snap.Records[0].Params["tag"] != "v2" {
		t.Fatalf("new occurrence = %+v", snap.Records)
	}
	if len(spy.toasts) != 2 {
		t.Fatalf("toasts=%d, want 2", len(spy.toasts))
	}
}

// A muted source is still recorded — history is the recovery surface — but
// it lands already read and raises no badge.
func TestCenterMutedSourceRecordedRead(t *testing.T) {
	center, _ := newTestCenter(t)
	center.opts.Muted = func(s Source) bool { return s == SourceUpdater }
	if err := center.Publish(validRecord(SourceUpdater, "u:1")); err != nil {
		t.Fatal(err)
	}
	snap := center.Snapshot()
	if len(snap.Records) != 1 || snap.Unread != 0 || snap.Records[0].Unread {
		t.Fatalf("muted record = %+v", snap.Records)
	}
}

func TestCenterStoreIsBounded(t *testing.T) {
	center, _ := newTestCenter(t)
	for i := 0; i < centerLimit+10; i++ {
		rec := validRecord(SourceLauncher, fmt.Sprintf("launcher:p%d", i))
		if err := center.Publish(rec); err != nil {
			t.Fatal(err)
		}
	}
	snap := center.Snapshot()
	if len(snap.Records) != centerLimit {
		t.Fatalf("records=%d, want capped at %d", len(snap.Records), centerLimit)
	}
	// Oldest evicted: the first published key must be gone.
	if snap.Records[centerLimit-1].DedupeKey != "launcher:p10" {
		t.Fatalf("oldest surviving = %q", snap.Records[centerLimit-1].DedupeKey)
	}
}

func TestCenterRejectsSpotterAndUnknownSources(t *testing.T) {
	center, spy := newTestCenter(t)
	for _, source := range []Source{"spotter", "engineer", "telemetry", "voice", "pit", ""} {
		if err := center.Publish(validRecord(source, "k")); !errors.Is(err, ErrSourceDenied) {
			t.Fatalf("source %q: err=%v, want ErrSourceDenied", source, err)
		}
	}
	if snap := center.Snapshot(); len(snap.Records) != 0 {
		t.Fatalf("denied sources produced records: %+v", snap.Records)
	}
	if len(spy.snapshots) != 0 || len(spy.toasts) != 0 {
		t.Fatal("denied sources emitted or toasted")
	}
}

func TestCenterRejectsInvalidPayloads(t *testing.T) {
	center, _ := newTestCenter(t)
	cases := map[string]Record{
		"bad severity":      {Source: SourceUpdater, Severity: "fatal", DedupeKey: "k", TitleKey: "t"},
		"missing title":     {Source: SourceUpdater, Severity: SeverityInfo, DedupeKey: "k"},
		"missing dedupe":    {Source: SourceUpdater, Severity: SeverityInfo, TitleKey: "t"},
		"too many params":   {Source: SourceUpdater, Severity: SeverityInfo, DedupeKey: "k", TitleKey: "t", Params: map[string]string{"a": "1", "b": "2", "c": "3", "d": "4", "e": "5", "f": "6", "g": "7", "h": "8", "i": "9"}},
		"long param value":  {Source: SourceUpdater, Severity: SeverityInfo, DedupeKey: "k", TitleKey: "t", Params: map[string]string{"k": strings.Repeat("v", maxParamLen+1)}},
		"bad action kind":   {Source: SourceUpdater, Severity: SeverityInfo, DedupeKey: "k", TitleKey: "t", Action: &Action{Kind: "open-url", Target: "settings:updates"}},
		"bad action target": {Source: SourceUpdater, Severity: SeverityInfo, DedupeKey: "k", TitleKey: "t", Action: &Action{Kind: "navigate", Target: "evil"}},
	}
	for name, rec := range cases {
		if err := center.Publish(rec); err == nil {
			t.Fatalf("%s: accepted", name)
		}
	}
	if len(center.Snapshot().Records) != 0 {
		t.Fatal("invalid payloads were stored")
	}
}

// Los campos de display se truncan a su cota en vez de rechazar el registro:
// un error de checksum largo no debe hacer desaparecer el aviso del centro.
func TestCenterTruncatesDisplayFields(t *testing.T) {
	center, _ := newTestCenter(t)
	rec := validRecord(SourceUpdater, "k")
	rec.ConcreteCause = strings.Repeat("x", maxCauseLen+50)
	rec.Fallback = strings.Repeat("y", maxFallback+50)
	if err := center.Publish(rec); err != nil {
		t.Fatalf("long display fields must be truncated, not rejected: %v", err)
	}
	stored := center.Snapshot().Records[0]
	if len(stored.ConcreteCause) != maxCauseLen {
		t.Fatalf("cause len=%d, want %d", len(stored.ConcreteCause), maxCauseLen)
	}
}

func TestCenterMarkReadAndClear(t *testing.T) {
	center, _ := newTestCenter(t)
	_ = center.Publish(validRecord(SourceUpdater, "a"))
	_ = center.Publish(validRecord(SourceLauncher, "b"))
	snap := center.Snapshot()
	if snap.Unread != 2 {
		t.Fatalf("unread=%d", snap.Unread)
	}
	center.MarkRead(snap.Records[1].ID)
	if snap := center.Snapshot(); snap.Unread != 1 || snap.Records[1].Unread {
		t.Fatalf("after mark one: %+v", snap.Records)
	}
	center.MarkRead("all")
	if snap := center.Snapshot(); snap.Unread != 0 {
		t.Fatalf("after mark all: unread=%d", snap.Unread)
	}
	center.Clear()
	if snap := center.Snapshot(); len(snap.Records) != 0 || snap.Unread != 0 {
		t.Fatalf("after clear: %+v", snap)
	}
}

func TestCenterResolveActionValidatesStoredPayload(t *testing.T) {
	center, _ := newTestCenter(t)
	rec := validRecord(SourceUpdater, "a")
	rec.Action = &Action{Kind: "navigate", Target: "settings:updates"}
	if err := center.Publish(rec); err != nil {
		t.Fatal(err)
	}
	id := center.Snapshot().Records[0].ID
	action, err := center.ResolveAction(id)
	if err != nil || action.Target != "settings:updates" {
		t.Fatalf("resolve = %+v, %v", action, err)
	}
	if _, err := center.ResolveAction("missing"); err == nil {
		t.Fatal("unknown id resolved")
	}
	_ = center.Publish(validRecord(SourceLauncher, "b")) // no action
	plainID := center.Snapshot().Records[0].ID
	if _, err := center.ResolveAction(plainID); err == nil {
		t.Fatal("record without action resolved")
	}
}

// A reconnected webview asks for one snapshot and must see the full recent
// state, ordered newest first, with the live unread count.
func TestCenterSnapshotSurvivesReconnect(t *testing.T) {
	center, _ := newTestCenter(t)
	_ = center.Publish(validRecord(SourceUpdater, "a"))
	_ = center.Publish(validRecord(SourceLauncher, "b"))
	snap := center.Snapshot()
	if len(snap.Records) != 2 || snap.Records[0].DedupeKey != "b" {
		t.Fatalf("snapshot order/content wrong: %+v", snap.Records)
	}
	if snap.Unread != 2 {
		t.Fatalf("unread=%d", snap.Unread)
	}
}

func TestCenterPublishConcurrent(t *testing.T) {
	center, _ := newTestCenter(t)
	var wg sync.WaitGroup
	errCh := make(chan error, 64)
	for i := 0; i < 64; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := center.Publish(validRecord(SourceLauncher, fmt.Sprintf("k%d", i%8))); err != nil {
				errCh <- err
			}
		}(i)
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Error(err)
	}
	snap := center.Snapshot()
	if len(snap.Records) > 8 {
		t.Fatalf("concurrent dedupe produced %d records, want ≤8", len(snap.Records))
	}
	if snap.Revision != 64 {
		t.Fatalf("revision=%d, want 64", snap.Revision)
	}
}
