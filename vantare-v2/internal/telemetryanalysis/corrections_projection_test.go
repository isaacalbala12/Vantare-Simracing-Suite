package telemetryanalysis

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestStoredCorrectionProjectionPinsRequestedRevision(t *testing.T) {
	fixture := loadLapValidityFixture(t, "lap-validity-s045-v1.json")
	session, pages := fixtureHistoricalInput(t, fixture)
	base, _, _, _ := correctionExample()
	base.SessionID = session.ID
	session.Provenance.Parser = ParserRef{ID: base.ParserID, Version: base.ParserVersion}
	session.Provenance.SchemaFingerprint = base.SchemaFingerprint
	classified := ClassifiedSession{SessionID: session.ID, Combination: CombinationIdentity{ID: "fixture-combination"}}
	var inputs []SampleCorrectionInput
	for c := range session.Channels {
		channel := &session.Channels[c]
		if channel.SourceName != "Lap Time" {
			continue
		}
		channel.Unit = HistoricalUnit{Symbol: "s", Quality: QualityValid}
		for _, page := range pages {
			if page.ChannelID != channel.ID {
				continue
			}
			for _, sample := range page.Samples {
				value := sample.Values[0]
				if value.Scalar.Number <= 0 {
					continue
				}
				replacement := value.Scalar
				replacement.Number++
				inputs = append(inputs, SampleCorrectionInput{Channel: *channel, Sample: sample, Request: SampleValueCorrection{Base: base, Target: SampleCorrectionTarget{ChannelID: channel.ID, Column: value.Column, SampleIndex: sample.Index}, Unit: channel.Unit, Expected: value, Replacement: replacement, Reason: "controlled test"}})
			}
		}
	}
	if len(inputs) == 0 {
		t.Fatal("no recorded targets")
	}
	ctx := context.Background()
	store := NewCorrectionStore(t.TempDir())
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	first, err := store.Save(ctx, base, inputs, CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "first", Reason: "test", LocalAuthorID: "test"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.Save(ctx, base, nil, CorrectionSaveCommand{ExpectedRevision: first.HeadID, CommandID: "restore", Reason: "test", LocalAuthorID: "test"})
	if err != nil {
		t.Fatal(err)
	}
	old, err := store.DeriveProjectionSession(ctx, base, session, pages, classified, first.Revision.RevisionID)
	if err != nil {
		t.Fatal(err)
	}
	baseline, err := store.DeriveProjectionSession(ctx, base, session, pages, classified, initial.SnapshotID)
	if err != nil {
		t.Fatal(err)
	}
	digest, err := base.Digest()
	if err != nil {
		t.Fatal(err)
	}
	if old.Revision == nil || old.Revision.BaseDigest != digest || old.Revision.RevisionID != first.Revision.RevisionID || old.Revision.SnapshotID != first.Revision.Snapshot.SnapshotID {
		t.Fatal("lost requested revision")
	}
	if baseline.Revision.RevisionID != initial.SnapshotID || reflect.DeepEqual(old.Validity.Laps, baseline.Validity.Laps) {
		t.Fatal("used current head instead of requested correction")
	}
	for _, id := range []string{"", strings.Repeat("f", 64)} {
		got, err := store.DeriveProjectionSession(ctx, base, session, pages, classified, id)
		if !errors.Is(err, ErrCorrectionRevisionMissing) || !reflect.DeepEqual(got, ProjectionSessionDerivations{}) {
			t.Fatal("missing revision substituted", err)
		}
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := store.DeriveProjectionSession(cancelled, base, session, pages, classified, first.HeadID); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}

func TestStoredCorrectionProjectionUsesDerivedClassification(t *testing.T) {
	base, session, pages := classifiedDerivationFixture(t)
	caller := classifiedDerivationCaller(t, session)
	var inputs []SampleCorrectionInput
	for c := range session.Channels {
		channel := &session.Channels[c]
		if channel.SourceName != "Lap Time" {
			continue
		}
		channel.Unit = HistoricalUnit{Symbol: "s", Quality: QualityValid}
		for _, page := range pages {
			if page.ChannelID != channel.ID {
				continue
			}
			for _, sample := range page.Samples {
				if sample.Values[0].Scalar.Number <= 0 {
					continue
				}
				replacement := sample.Values[0].Scalar
				replacement.Number++
				inputs = append(inputs, SampleCorrectionInput{Channel: *channel, Sample: sample, Request: SampleValueCorrection{Base: base, Target: SampleCorrectionTarget{ChannelID: channel.ID, Column: sample.Values[0].Column, SampleIndex: sample.Index}, Unit: channel.Unit, Expected: sample.Values[0], Replacement: replacement, Reason: "controlled test"}})
				break
			}
			break
		}
		break
	}
	if len(inputs) == 0 {
		t.Fatal("no recorded targets")
	}
	ctx := context.Background()
	root := t.TempDir()
	store := NewCorrectionStore(root)
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	input := ObservationCorrectionInput{Samples: inputs, FamilyUses: []LapFamilyUseCorrection{}, Session: session,
		Classifications: mixedSnapshotClassRequests(base)}
	first, err := store.SaveObservations(ctx, base, input, CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "classify", Reason: "test", LocalAuthorID: "test"})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Revision.Snapshot.Classifications) != 2 {
		t.Fatal("both classification decisions not stored")
	}
	withdraw := input
	withdraw.Classifications = []ClassificationCorrection{}
	second, err := store.SaveObservations(ctx, base, withdraw, CorrectionSaveCommand{ExpectedRevision: first.HeadID, CommandID: "withdraw", Reason: "test", LocalAuthorID: "test"})
	if err != nil {
		t.Fatal(err)
	}
	reopened := NewCorrectionStore(root)
	old, err := reopened.DeriveProjectionSession(ctx, base, session, pages, caller, first.Revision.RevisionID)
	if err != nil {
		t.Fatal(err)
	}
	if old.Classified.Type != SessionTypeQualify || old.Classified.WeatherConditions != "Wet" {
		t.Fatalf("old revision lost corrected labels: %+v", old.Classified)
	}
	if old.Revision == nil || old.Revision.RevisionID != first.Revision.RevisionID || old.Revision.SnapshotID != first.Revision.Snapshot.SnapshotID || old.Revision.SnapshotID == second.Revision.Snapshot.SnapshotID {
		t.Fatal("old revision lost exact history or adopted current head", old)
	}
	legacy, err := reopened.DeriveProjectionSession(ctx, base, session, pages, caller, initial.SnapshotID)
	if err != nil {
		t.Fatal(err)
	}
	if legacy.Classified.Type != caller.Type || !reflect.DeepEqual(legacy.Classified.Combination, caller.Combination) || legacy.Classified.Status != SessionStatusIdentifiedUsable {
		t.Fatalf("legacy identity or refreshed gate wrong: %+v", legacy.Classified)
	}
	projection, err := ProduceStrategyInputProjectionV2(ProjectionProductionRequest{
		GeneratedAt: time.Now().UTC().Truncate(time.Millisecond),
		Combination: old.Classified.Combination,
		Sessions:    []ProjectionSessionDerivations{old},
	})
	if err != nil {
		t.Fatal(err)
	}
	if projection.SessionClassification.SessionType != "qualify" || projection.SessionClassification.WeatherConditions != "Wet" {
		t.Fatalf("projection lost derived classification: %+v", projection.SessionClassification)
	}
	if len(projection.SourceRevisions) != 1 || projection.SourceRevisions[0] != *old.Revision {
		t.Fatal("projection lost exact stored reference", projection.SourceRevisions)
	}
	restored, err := reopened.DeriveProjectionSession(ctx, base, session, pages, caller, second.Revision.RevisionID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Classified.Type != SessionTypeRace || restored.Classified.WeatherConditions != "Dry" {
		t.Fatalf("withdrawal lost original labels: %+v", restored.Classified)
	}
}
