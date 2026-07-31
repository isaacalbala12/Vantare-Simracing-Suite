package diagnostics

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/recording"
)

type fakeStore struct {
	summaries map[string]recording.SessionSummary
	readers   map[string]recording.HistoricalReplayReader
	inspect   []string
	opened    []string
}

type fakeHistoricalReader struct {
	snapshot recording.HistoricalSnapshot
	page     recording.HistoricalPage
}

type cancelingHistoricalReader struct {
	snapshot recording.HistoricalSnapshot
	cancel   context.CancelFunc
}

func (reader *cancelingHistoricalReader) Snapshot() recording.HistoricalSnapshot {
	return reader.snapshot
}

func (reader *cancelingHistoricalReader) QueryPage(
	ctx context.Context,
	_ recording.HistoricalQuery,
) (recording.HistoricalPage, error) {
	reader.cancel()
	return recording.HistoricalPage{}, ctx.Err()
}

func (*cancelingHistoricalReader) Close() error { return nil }

func (reader *fakeHistoricalReader) Snapshot() recording.HistoricalSnapshot {
	return reader.snapshot
}

func (reader *fakeHistoricalReader) QueryPage(
	_ context.Context,
	query recording.HistoricalQuery,
) (recording.HistoricalPage, error) {
	if query.SnapshotID != reader.snapshot.ID {
		return recording.HistoricalPage{}, recording.ErrHistoricalSnapshot
	}
	return reader.page, nil
}

func (*fakeHistoricalReader) Close() error { return nil }

func (store *fakeStore) Inspect(_ context.Context, ref recording.SessionRef) (recording.SessionSummary, error) {
	store.inspect = append(store.inspect, ref.SessionID)
	summary, ok := store.summaries[ref.SessionID]
	if !ok {
		return recording.SessionSummary{}, errors.New("unavailable")
	}
	return summary, nil
}

func (store *fakeStore) OpenHistoricalReplay(_ context.Context, ref recording.SessionRef) (recording.HistoricalReplayReader, error) {
	store.opened = append(store.opened, ref.SessionID)
	reader, ok := store.readers[ref.SessionID]
	if !ok {
		return nil, errors.New("unavailable")
	}
	return reader, nil
}

func TestCatalogListIsMetadataOnlyAndInspectIsExplicit(t *testing.T) {
	root := t.TempDir()
	started := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	manifest := recording.NewSessionManifest("session-private-identity", "lmu", "private-build", started)
	writeManifest(t, root, manifest)
	store := &fakeStore{summaries: map[string]recording.SessionSummary{
		manifest.SessionID: {
			Ref:      recording.SessionRef{Root: root, SessionID: manifest.SessionID},
			Manifest: manifest, EffectiveIntegrity: recording.IntegrityComplete,
			ObservedCount: 3, FactCount: 1, CountsKnown: false,
		},
	}, readers: map[string]recording.HistoricalReplayReader{}}
	catalog, err := NewCatalog(root, store)
	if err != nil {
		t.Fatalf("NewCatalog() error = %v", err)
	}
	listed, err := catalog.List(context.Background(), 10)
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(listed.Sessions) != 1 || !strings.HasPrefix(listed.Sessions[0].Handle, "diag-") {
		t.Fatalf("sessions = %#v", listed)
	}
	if len(store.inspect) != 0 || len(store.opened) != 0 {
		t.Fatalf("List opened backend storage: inspect=%v replay=%v", store.inspect, store.opened)
	}
	inspected, err := catalog.Inspect(context.Background(), listed.Sessions[0].Handle)
	if err != nil || inspected.ObservedCount != 3 {
		t.Fatalf("Inspect() = %#v, %v", inspected, err)
	}
	if len(store.inspect) != 1 {
		t.Fatalf("Inspect calls = %v", store.inspect)
	}
	encoded, err := json.Marshal(listed)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{root, manifest.SessionID, manifest.ActiveDatabase, manifest.AppBuild} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("catalog leaked %q: %s", forbidden, encoded)
		}
	}
}

func TestCatalogFutureManifestIsMetadataOnlyEvenWhenInspected(t *testing.T) {
	root := t.TempDir()
	started := time.Date(2026, 7, 30, 11, 0, 0, 0, time.UTC)
	manifest := recording.NewSessionManifest("session-future-version", "lmu", "build", started)
	manifest.ManifestVersion++
	manifest.RecordingSchemaVersion++
	manifest.ActiveDatabase = "history-v2.sqlite"
	writeManifest(t, root, manifest)
	store := &fakeStore{summaries: map[string]recording.SessionSummary{}, readers: map[string]recording.HistoricalReplayReader{}}
	catalog, _ := NewCatalog(root, store)
	listed, err := catalog.List(context.Background(), 10)
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	session, err := catalog.Inspect(context.Background(), listed.Sessions[0].Handle)
	if err != nil || session.Compatibility != CompatibilityFuture ||
		session.Availability != AvailabilityMetadataOnly {
		t.Fatalf("future session = %#v, %v", session, err)
	}
	if len(store.inspect) != 0 || len(store.opened) != 0 {
		t.Fatalf("future database was opened: inspect=%v replay=%v", store.inspect, store.opened)
	}
}

func TestCatalogListIsHardBoundedAndSignalsTruncation(t *testing.T) {
	root := t.TempDir()
	for index := 0; index < MaxCatalogLimit+20; index++ {
		id := "session-bounded-" + strconv.Itoa(index)
		manifest := recording.NewSessionManifest(id, "lmu", "build", time.Unix(int64(index+1), 0).UTC())
		writeManifest(t, root, manifest)
	}
	store := &fakeStore{}
	catalog, _ := NewCatalog(root, store)
	listed, err := catalog.List(context.Background(), MaxCatalogLimit)
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if !listed.Truncated || len(listed.Sessions) > MaxCatalogLimit {
		t.Fatalf("List() = len %d truncated %v", len(listed.Sessions), listed.Truncated)
	}
	catalog.mu.Lock()
	handleCount := len(catalog.handles)
	catalog.mu.Unlock()
	if handleCount > MaxCatalogLimit {
		t.Fatalf("handles = %d", handleCount)
	}
	if len(store.inspect) != 0 || len(store.opened) != 0 {
		t.Fatal("bounded List opened historical storage")
	}
}

func TestCatalogHandlesExpireAndOnlyCurrentGenerationResolves(t *testing.T) {
	root := t.TempDir()
	manifest := recording.NewSessionManifest(
		"session-generation-value", "lmu", "build",
		time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC),
	)
	writeManifest(t, root, manifest)
	catalog, _ := NewCatalog(root, &fakeStore{})
	now := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	catalog.now = func() time.Time { return now }
	first, _ := catalog.List(context.Background(), 10)
	firstHandle := first.Sessions[0].Handle
	second, _ := catalog.List(context.Background(), 10)
	if _, ok := catalog.Resolve(firstHandle); ok {
		t.Fatal("previous generation handle still resolves")
	}
	if _, ok := catalog.Resolve(second.Sessions[0].Handle); !ok {
		t.Fatal("current generation handle does not resolve")
	}
	now = now.Add(DefaultCatalogHandleTTL)
	if _, ok := catalog.Resolve(second.Sessions[0].Handle); ok {
		t.Fatal("expired handle still resolves")
	}
}

func TestCatalogInvalidatesRemovedOrReplacedSessions(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(t *testing.T, directory string)
	}{
		{
			name: "removed",
			mutate: func(t *testing.T, directory string) {
				t.Helper()
				if err := os.RemoveAll(directory); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "manifest replaced",
			mutate: func(t *testing.T, directory string) {
				t.Helper()
				path := filepath.Join(directory, manifestFilename)
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(path, []byte(`{"manifestVersion":1,"recordingSchemaVersion":1}`), 0o600); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "manifest rewritten in place with metadata preserved",
			mutate: func(t *testing.T, directory string) {
				t.Helper()
				path := filepath.Join(directory, manifestFilename)
				before, err := os.Stat(path)
				if err != nil {
					t.Fatal(err)
				}
				data, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				original := []byte(`"integrityState":"recording"`)
				replacement := []byte(`"integrityState":"invalidxx"`)
				if !bytes.Contains(data, original) || len(original) != len(replacement) {
					t.Fatal("manifest fixture cannot preserve size")
				}
				data = bytes.Replace(data, original, replacement, 1)
				if err := os.WriteFile(path, data, 0o600); err != nil {
					t.Fatal(err)
				}
				if err := os.Chtimes(path, before.ModTime(), before.ModTime()); err != nil {
					t.Fatal(err)
				}
				after, err := os.Stat(path)
				if err != nil {
					t.Fatal(err)
				}
				if !os.SameFile(before, after) ||
					before.Size() != after.Size() ||
					!before.ModTime().Equal(after.ModTime()) {
					t.Fatal("fixture did not preserve file ID, size and mtime")
				}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			root := t.TempDir()
			manifest := recording.NewSessionManifest("session-stale-value", "lmu", "build", time.Now().UTC())
			writeManifest(t, root, manifest)
			catalog, _ := NewCatalog(root, &fakeStore{})
			listed, _ := catalog.List(context.Background(), 10)
			tt.mutate(t, filepath.Join(root, manifest.SessionID))
			if _, ok := catalog.Resolve(listed.Sessions[0].Handle); ok {
				t.Fatal("stale handle resolved")
			}
			if _, err := catalog.Inspect(context.Background(), listed.Sessions[0].Handle); !errors.Is(err, ErrStaleCatalogHandle) {
				t.Fatalf("Inspect() error = %v", err)
			}
		})
	}
}

func TestCatalogDatabaseBindingAllowsLegitimateContentRevision(t *testing.T) {
	root := t.TempDir()
	manifest := recording.NewSessionManifest(
		"session-live-revision", "lmu", "build", time.Now().UTC(),
	)
	writeManifest(t, root, manifest)
	catalog, _ := NewCatalog(root, &fakeStore{})
	listed, _ := catalog.List(context.Background(), 10)
	path := filepath.Join(root, manifest.SessionID, recording.ActiveDatabaseV1)
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.WriteString("-legitimate-live-update"); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if _, ok := catalog.Resolve(listed.Sessions[0].Handle); !ok {
		t.Fatal("live SQLite revision invalidated the session handle")
	}
}

func TestCatalogRejectsSymlinkSessionEscapes(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	manifest := recording.NewSessionManifest("session-outside-value", "lmu", "build", time.Now().UTC())
	writeManifest(t, outside, manifest)
	link := filepath.Join(root, "session-link-value")
	if err := os.Symlink(filepath.Join(outside, manifest.SessionID), link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	catalog, _ := NewCatalog(root, &fakeStore{})
	listed, err := catalog.List(context.Background(), 10)
	if err != nil || len(listed.Sessions) != 0 {
		t.Fatalf("List() = %#v, %v", listed, err)
	}
}

func TestCatalogRejectsSymlinkManifestAndKeepsNormalSession(t *testing.T) {
	root := t.TempDir()
	normal := recording.NewSessionManifest(
		"session-normal-manifest", "lmu", "build", time.Now().UTC(),
	)
	writeManifest(t, root, normal)

	outside := t.TempDir()
	external := recording.NewSessionManifest(
		"session-external-manifest", "lmu", "build", time.Now().UTC(),
	)
	writeManifest(t, outside, external)

	symlinkSession := filepath.Join(root, "session-symlink-manifest")
	if err := os.Mkdir(symlinkSession, 0o700); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(symlinkSession, manifestFilename)
	target := filepath.Join(outside, external.SessionID, manifestFilename)
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("manifest symlink unavailable on this OS: %v", err)
	}

	catalog, err := NewCatalog(root, &fakeStore{})
	if err != nil {
		t.Fatal(err)
	}
	listed, err := catalog.List(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed.Sessions) != 1 {
		t.Fatalf("List() returned %d sessions, want only normal manifest", len(listed.Sessions))
	}
	if listed.Sessions[0].Simulator != "lmu" {
		t.Fatalf("normal manifest simulator = %q", listed.Sessions[0].Simulator)
	}
}

func TestCatalogCorruptEmptyCanceledAndOversizedMetadata(t *testing.T) {
	t.Run("empty", func(t *testing.T) {
		catalog, _ := NewCatalog(t.TempDir(), &fakeStore{})
		listed, err := catalog.List(context.Background(), 0)
		if err != nil || len(listed.Sessions) != 0 {
			t.Fatalf("List() = %#v, %v", listed, err)
		}
	})
	for _, tt := range []struct {
		name string
		data []byte
	}{
		{name: "corrupt", data: []byte("{")},
		{name: "oversized", data: make([]byte, maxCatalogMetadataBytes+1)},
	} {
		t.Run(tt.name, func(t *testing.T) {
			root := t.TempDir()
			dir := filepath.Join(root, "session-invalid-value")
			if err := os.MkdirAll(dir, 0o700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dir, manifestFilename), tt.data, 0o600); err != nil {
				t.Fatal(err)
			}
			catalog, _ := NewCatalog(root, &fakeStore{})
			listed, err := catalog.List(context.Background(), 10)
			if err != nil || len(listed.Sessions) != 1 ||
				listed.Sessions[0].Compatibility != CompatibilityCorrupt {
				t.Fatalf("List() = %#v, %v", listed, err)
			}
		})
	}
	t.Run("canceled", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		catalog, _ := NewCatalog(t.TempDir(), &fakeStore{})
		if _, err := catalog.List(ctx, 10); !errors.Is(err, context.Canceled) {
			t.Fatalf("List() error = %v", err)
		}
	})
}

func TestCatalogOrdersNewestFirstAndLimits(t *testing.T) {
	root := t.TempDir()
	for index := 1; index <= 3; index++ {
		started := time.Date(2026, 7, 30, index, 0, 0, 0, time.UTC)
		id := "session-order-value-" + string(rune('0'+index))
		writeManifest(t, root, recording.NewSessionManifest(id, "lmu", "build", started))
	}
	catalog, _ := NewCatalog(root, &fakeStore{})
	listed, err := catalog.List(context.Background(), 2)
	if err != nil || len(listed.Sessions) != 2 || !listed.Truncated {
		t.Fatalf("List() = %#v, %v", listed, err)
	}
	if !listed.Sessions[0].StartedAtUTC.After(listed.Sessions[1].StartedAtUTC) {
		t.Fatalf("sessions not newest first: %#v", listed.Sessions)
	}
}

func TestCatalogSelectsNewestGloballyBeyondFirstFiveHundredEntries(t *testing.T) {
	root := t.TempDir()
	for index := 0; index < 25; index++ {
		if err := os.Mkdir(filepath.Join(root, fmt.Sprintf("000-garbage-%03d", index)), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	for index := 0; index < MaxCatalogLimit+5; index++ {
		started := time.Date(2025, 1, 1, 0, index%60, 0, 0, time.UTC)
		manifest := recording.NewSessionManifest(
			fmt.Sprintf("100-old-session-%03d", index), "lmu", "build", started,
		)
		writeManifest(t, root, manifest)
	}
	newestStarted := time.Date(2026, 7, 31, 12, 0, 0, 0, time.UTC)
	writeManifest(t, root, recording.NewSessionManifest(
		"zzz-newest-session", "lmu", "build", newestStarted,
	))

	catalog, err := NewCatalog(root, &fakeStore{})
	if err != nil {
		t.Fatal(err)
	}
	listed, err := catalog.List(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed.Sessions) != 10 || !listed.Truncated {
		t.Fatalf("List() = len %d truncated %v", len(listed.Sessions), listed.Truncated)
	}
	if !listed.Sessions[0].StartedAtUTC.Equal(newestStarted) {
		t.Fatalf("newest global session omitted: first=%v want=%v", listed.Sessions[0].StartedAtUTC, newestStarted)
	}
}

func TestCatalogInspectReportsPresenceAndAggregateQuality(t *testing.T) {
	root := t.TempDir()
	started := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	manifest := recording.NewSessionManifest("session-fields-quality", "lmu", "build", started)
	writeManifest(t, root, manifest)
	payload := recording.RecordingPayloadV1{
		Version: recording.RecordingVersionV1, Channel: recording.ChannelObserved,
		Epoch: 1, Sequence: 1, CapturedAtUTC: started,
		Vehicles: []recording.RecordingVehicleV1{{
			SessionSlot: 1, SpeedMS: 10,
			Presence: recording.PresenceSpeed | recording.PresenceGear,
			Quality:  recording.QualityStale,
		}},
	}
	fact := recording.RecordingFactV1{
		Version: recording.RecordingVersionV1, Channel: recording.ChannelFact,
		Epoch: 1, FactSequence: 1, CausalSnapshotSequence: 1,
		OccurredAtUTC: started, FactType: recording.FactLapCompleted,
		Presence: recording.PresenceFactValue, Quality: recording.QualityCurrent,
	}
	reader := &fakeHistoricalReader{
		snapshot: recording.HistoricalSnapshot{ID: "snapshot"},
		page: recording.HistoricalPage{
			SnapshotID: "snapshot",
			Records: []recording.HistoricalRecord{
				{AtUTC: started, Observed: &payload},
				{AtUTC: started, Fact: &fact},
			},
		},
	}
	store := &fakeStore{
		summaries: map[string]recording.SessionSummary{
			manifest.SessionID: {
				Manifest: manifest, EffectiveIntegrity: recording.IntegrityRecording,
				ObservedCount: 1, FactCount: 1, CountsKnown: true,
			},
		},
		readers: map[string]recording.HistoricalReplayReader{manifest.SessionID: reader},
	}
	catalog, _ := NewCatalog(root, store)
	listed, _ := catalog.List(context.Background(), 10)
	session, err := catalog.Inspect(context.Background(), listed.Sessions[0].Handle)
	if err != nil || session.LapCount != 1 || session.VehicleCount != 1 {
		t.Fatalf("Inspect() = %#v, %v", session, err)
	}
	presence := make(map[string]bool)
	for _, field := range session.Fields {
		presence[field.Name] = field.Present
	}
	if !presence["speed"] || !presence["gear"] || presence["brake"] || !presence["factValue"] {
		t.Fatalf("presence = %#v", presence)
	}
	encoded, _ := json.Marshal(session.Quality)
	if strings.Contains(string(encoded), "speed") || strings.Contains(string(encoded), "gear") {
		t.Fatalf("quality incorrectly claimed per-signal precision: %s", encoded)
	}
}

func TestCatalogInspectPropagatesCancellation(t *testing.T) {
	root := t.TempDir()
	started := time.Date(2026, 7, 30, 10, 0, 0, 0, time.UTC)
	manifest := recording.NewSessionManifest("session-canceled-summary", "lmu", "build", started)
	writeManifest(t, root, manifest)
	ctx, cancel := context.WithCancel(context.Background())
	reader := &cancelingHistoricalReader{
		snapshot: recording.HistoricalSnapshot{ID: "snapshot"},
		cancel:   cancel,
	}
	store := &fakeStore{
		summaries: map[string]recording.SessionSummary{
			manifest.SessionID: {
				Manifest: manifest, EffectiveIntegrity: recording.IntegrityRecording,
				CountsKnown: true,
			},
		},
		readers: map[string]recording.HistoricalReplayReader{manifest.SessionID: reader},
	}
	catalog, _ := NewCatalog(root, store)
	listed, _ := catalog.List(context.Background(), 10)
	if _, err := catalog.Inspect(ctx, listed.Sessions[0].Handle); !errors.Is(err, context.Canceled) {
		t.Fatalf("Inspect() error = %v", err)
	}
}

func writeManifest(t *testing.T, root string, manifest recording.SessionManifest) {
	t.Helper()
	dir := filepath.Join(root, manifest.SessionID)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, manifestFilename), encoded, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, recording.ActiveDatabaseV1), []byte("fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
}
