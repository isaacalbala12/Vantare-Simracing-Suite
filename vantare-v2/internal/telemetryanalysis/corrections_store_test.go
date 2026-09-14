package telemetryanalysis

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func observationStoreExample(t *testing.T) (SourceAnalysisRef, ObservationCorrectionInput, CorrectionSaveCommand) {
	t.Helper()
	base, original, family := lapFamilyCorrectionExample(t)
	_, channel, sample, request := correctionExample()
	request.Base = base
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	input := ObservationCorrectionInput{Samples: []SampleCorrectionInput{{Channel: channel, Sample: sample, Request: request}}, Original: original, Effective: original, FamilyUses: []LapFamilyUseCorrection{family}}
	command := CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "mixed", Reason: "Review fuel and pace", LocalAuthorID: "local"}
	return base, input, command
}

func TestObservationStoreRestartRestoreAndLegacyProtection(t *testing.T) {
	ctx := context.Background()
	base, input, command := observationStoreExample(t)
	root := t.TempDir()
	store := NewCorrectionStore(root)
	legacy := command
	legacy.CommandID = "legacy"
	first, err := store.Save(ctx, base, input.Samples, legacy)
	if err != nil {
		t.Fatal(err)
	}
	command.ExpectedRevision = first.HeadID
	mixed, err := store.SaveObservations(ctx, base, input, command)
	if err != nil || len(mixed.Revision.Snapshot.FamilyUses) != 1 || len(mixed.Revision.Snapshot.Corrections) != 1 {
		t.Fatal("mixed revision not saved", err)
	}
	store = NewCorrectionStore(root)
	loaded, err := store.Load(ctx, base, mixed.HeadID)
	if err != nil || loaded.Revision.Snapshot.SnapshotID != mixed.Revision.Snapshot.SnapshotID {
		t.Fatal("restart lost mixed revision", err)
	}
	clear := CorrectionSaveCommand{ExpectedRevision: mixed.HeadID, CommandID: "clear", Reason: "Restore original family selection", LocalAuthorID: "local"}
	if _, err := store.Save(ctx, base, input.Samples, clear); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("legacy caller erased unknown family decisions", err)
	}
	replay, err := store.Save(ctx, base, input.Samples, legacy)
	if err != nil || replay.Revision.RevisionID != first.HeadID || replay.HeadID != mixed.HeadID {
		t.Fatal("legacy guard blocked historical exact replay", err)
	}
	empty := input
	empty.FamilyUses = []LapFamilyUseCorrection{}
	restored, err := store.SaveObservations(ctx, base, empty, clear)
	if err != nil || len(restored.Revision.Snapshot.FamilyUses) != 0 || restored.Revision.Snapshot.SnapshotID != first.Revision.Snapshot.SnapshotID || restored.HeadID == first.HeadID {
		t.Fatal("explicit restoration changed history", err)
	}
	old, err := store.Load(ctx, base, mixed.HeadID)
	if err != nil || len(old.Revision.Snapshot.FamilyUses) != 1 || old.HeadID != restored.HeadID {
		t.Fatal("restoration deleted historical family revision", err)
	}
}

func pendingCommandExample(t *testing.T) (SourceAnalysisRef, ObservationCorrectionInput, PendingCorrectionCommand) {
	t.Helper()
	base, input, command := observationStoreExample(t)
	input.Classifications = []ClassificationCorrection{}
	input.StintBoundaries = []StintBoundaryCorrection{}
	pending := PendingCorrectionCommand{
		Corrections:     []SampleValueCorrection{input.Samples[0].Request},
		FamilyUses:      append([]LapFamilyUseCorrection{}, input.FamilyUses...),
		Classifications: []ClassificationCorrection{},
		StintBoundaries: []StintBoundaryCorrection{},
		Command:         command,
	}
	return base, input, pending
}

func TestCorrectionStorePendingCommandSurvivesRestartAndAcknowledgesExactly(t *testing.T) {
	ctx := context.Background()
	base, input, pending := pendingCommandExample(t)
	root := t.TempDir()
	store := NewCorrectionStore(root)
	staged, err := store.StagePendingCommand(ctx, base, pending)
	if err != nil || staged.CommandDigest == "" {
		t.Fatal("pending command was not staged", err)
	}
	current, err := store.Load(ctx, base, "")
	if err != nil || current.HeadID != pending.Command.ExpectedRevision {
		t.Fatal("staging changed the correction head", err)
	}
	restarted := NewCorrectionStore(root)
	loaded, err := restarted.LoadPendingCommand(ctx, base)
	if err != nil || loaded == nil || loaded.Command.CommandID != pending.Command.CommandID || len(loaded.Corrections) != 1 || loaded.FamilyUses == nil || loaded.Classifications == nil || loaded.StintBoundaries == nil {
		t.Fatal("restart lost the exact pending command", err)
	}
	if _, err := restarted.SaveObservations(ctx, base, input, pending.Command); err != nil {
		t.Fatal("cannot commit staged command", err)
	}
	resolved, err := NewCorrectionStore(root).ResolveStintMixedCommand(ctx, base, pending.Corrections, pending.FamilyUses, pending.Classifications, pending.StintBoundaries, pending.Command)
	if err != nil || !resolved.Found || resolved.Revision == nil {
		t.Fatal("restart cannot resolve committed pending command", err)
	}
	if err := NewCorrectionStore(root).AcknowledgePendingCommand(ctx, base, pending.Command.CommandID); err != nil {
		t.Fatal("cannot acknowledge pending command", err)
	}
	if loaded, err := NewCorrectionStore(root).LoadPendingCommand(ctx, base); err != nil || loaded != nil {
		t.Fatal("acknowledged command remained pending", err)
	}
	if err := NewCorrectionStore(root).AcknowledgePendingCommand(ctx, base, pending.Command.CommandID); err != nil {
		t.Fatal("repeated acknowledgement was not idempotent", err)
	}
}

func TestCorrectionStorePendingCommandRecoversLostStageAcknowledgement(t *testing.T) {
	ctx := context.Background()
	base, _, pending := pendingCommandExample(t)
	root := t.TempDir()
	store := NewCorrectionStore(root)
	store.writeFile = func(path string, data []byte) error {
		if err := writeAuthorizedSessionFile(path, data); err != nil {
			return err
		}
		if !strings.HasSuffix(path, ".bak") {
			return errors.New("lost acknowledgement")
		}
		return nil
	}
	if _, err := store.StagePendingCommand(ctx, base, pending); !errors.Is(err, ErrCorrectionCommitUncertain) {
		t.Fatal("uncertain stage reported success", err)
	}
	restarted := NewCorrectionStore(root)
	replayed, err := restarted.StagePendingCommand(ctx, base, pending)
	if err != nil || replayed.CommandDigest == "" {
		t.Fatal("restart did not recover exact staged command", err)
	}
	loaded, err := restarted.LoadPendingCommand(ctx, base)
	if err != nil || loaded == nil || loaded.CommandDigest != replayed.CommandDigest {
		t.Fatal("recovered stage was duplicated or lost", err)
	}
}

func TestCorrectionStorePendingCommandPreservesAbsenceConflictAndCurrentHead(t *testing.T) {
	ctx := context.Background()
	base, input, pending := pendingCommandExample(t)
	root := t.TempDir()
	store := NewCorrectionStore(root)
	if _, err := store.StagePendingCommand(ctx, base, pending); err != nil {
		t.Fatal(err)
	}
	changed := pending
	changed.Command.Reason = "changed"
	if _, err := store.StagePendingCommand(ctx, base, changed); !errors.Is(err, ErrCorrectionConflict) {
		t.Fatal("replaced pending payload under the same identity", err)
	}
	other := input
	otherCommand := pending.Command
	otherCommand.CommandID = "other-writer"
	if _, err := store.SaveObservations(ctx, base, other, otherCommand); err != nil {
		t.Fatal("other writer could not advance head", err)
	}
	resolution, err := NewCorrectionStore(root).ResolveStintMixedCommand(ctx, base, pending.Corrections, pending.FamilyUses, pending.Classifications, pending.StintBoundaries, pending.Command)
	if err != nil || resolution.Found || resolution.HeadID == pending.Command.ExpectedRevision {
		t.Fatal("pending absence hid the newer head", resolution, err)
	}
	loaded, err := NewCorrectionStore(root).LoadPendingCommand(ctx, base)
	if err != nil || loaded == nil || loaded.Command.CommandID != pending.Command.CommandID {
		t.Fatal("conflict discarded pending intent", err)
	}
	if err := store.AcknowledgePendingCommand(ctx, base, "different"); !errors.Is(err, ErrCorrectionConflict) {
		t.Fatal("acknowledged a different command", err)
	}
}

func TestCorrectionStoreRejectsTamperedOrImplicitPendingCommand(t *testing.T) {
	ctx := context.Background()
	base, _, pending := pendingCommandExample(t)
	root := t.TempDir()
	store := NewCorrectionStore(root)
	implicit := pending
	implicit.Classifications = nil
	if _, err := store.StagePendingCommand(ctx, base, implicit); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("accepted an implicit correction set", err)
	}
	if _, err := store.StagePendingCommand(ctx, base, pending); err != nil {
		t.Fatal(err)
	}
	digest, err := base.Digest()
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "corrections", digest+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	data = []byte(strings.Replace(string(data), pending.Command.Reason, "tampered", 1))
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path+".bak", data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := store.LoadPendingCommand(ctx, base); !errors.Is(err, ErrCorruptCorrections) {
		t.Fatal("tampered pending command was accepted", err)
	}
}

func TestObservationStoreResolvesFullPayloadWithoutAnotherWrite(t *testing.T) {
	ctx := context.Background()
	base, input, command := observationStoreExample(t)
	store := NewCorrectionStore(t.TempDir())
	requests := []SampleValueCorrection{input.Samples[0].Request}
	missing, err := store.ResolveObservationsCommand(ctx, base, requests, input.FamilyUses, command)
	if err != nil || missing.Found || missing.HeadID != command.ExpectedRevision {
		t.Fatal("cannot confirm absence", err)
	}
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	store.writeFile = func(string, []byte) error { t.Error("resolution wrote history"); return errors.New("unexpected write") }
	found, err := store.ResolveObservationsCommand(ctx, base, requests, input.FamilyUses, command)
	if err != nil || !found.Found || found.Revision == nil || found.Revision.RevisionID != saved.HeadID {
		t.Fatal("cannot resolve exact mixed command", err)
	}
	changed := append([]LapFamilyUseCorrection(nil), input.FamilyUses...)
	changed[0].Reason = "Changed payload"
	if _, err := store.ResolveObservationsCommand(ctx, base, requests, changed, command); !errors.Is(err, ErrCorrectionConflict) {
		t.Fatal("ignored family payload change", err)
	}
	if _, err := store.ResolveObservationsCommand(ctx, base, requests, []LapFamilyUseCorrection{}, command); !errors.Is(err, ErrCorrectionConflict) {
		t.Fatal("ignored removed family payload", err)
	}
	_, lease, err := store.lock(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	_, resolveErr := store.ResolveObservationsCommand(ctx, base, requests, input.FamilyUses, command)
	if err := lease.Close(); err != nil {
		t.Fatal(err)
	}
	if !errors.Is(resolveErr, ErrCorrectionWriteInProgress) {
		t.Fatal("resolution bypassed writer lease", resolveErr)
	}
}

func TestObservationStoreRejectsEffectiveTargetChangesBeforeWriting(t *testing.T) {
	ctx := context.Background()
	base, input, command := observationStoreExample(t)
	store := NewCorrectionStore(t.TempDir())
	input.Effective.Laps = cloneFamilyCorrectionLaps(input.Original.Laps)
	input.Effective.Laps[0].End = input.Effective.Laps[0].End.Add(time.Second)
	if result, err := store.SaveObservations(ctx, base, input, command); !errors.Is(err, ErrCorrectionTarget) || result.HeadID != "" {
		t.Fatal("persisted family decision after target changed", err)
	}
	loaded, err := store.Load(ctx, base, command.ExpectedRevision)
	if err != nil || loaded.HeadID != command.ExpectedRevision {
		t.Fatal("rejected snapshot changed head", err)
	}
	input.FamilyUses = nil
	if _, err := store.SaveObservations(ctx, base, input, command); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("accepted implicit missing family set", err)
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	input.FamilyUses = []LapFamilyUseCorrection{}
	if _, err := store.SaveObservations(cancelled, base, input, command); !errors.Is(err, context.Canceled) {
		t.Fatal("ignored cancellation", err)
	}
}

func TestObservationStoreRecoversUncertainMixedCommit(t *testing.T) {
	for _, failBackup := range []bool{true, false} {
		t.Run(fmt.Sprint(failBackup), func(t *testing.T) {
			ctx := context.Background()
			base, input, command := observationStoreExample(t)
			store := NewCorrectionStore(t.TempDir())
			store.writeFile = func(path string, data []byte) error {
				if err := writeAuthorizedSessionFile(path, data); err != nil {
					return err
				}
				if strings.HasSuffix(path, ".bak") == failBackup {
					return errors.New("lost acknowledgement")
				}
				return nil
			}
			if result, err := store.SaveObservations(ctx, base, input, command); !errors.Is(err, ErrCorrectionCommitUncertain) || result.HeadID != "" {
				t.Fatal("false durable mixed acknowledgement", err)
			}
			store.writeFile = writeAuthorizedSessionFile
			found, err := store.ResolveObservationsCommand(ctx, base, []SampleValueCorrection{input.Samples[0].Request}, input.FamilyUses, command)
			if err != nil || !found.Found || found.Revision == nil || len(found.Revision.Snapshot.FamilyUses) != 1 {
				t.Fatal("lost uncertain family command", err)
			}
			replay, err := store.SaveObservations(ctx, base, input, command)
			if err != nil || replay.HeadID != found.Revision.RevisionID || replay.Revision.ParentRevisionID != command.ExpectedRevision {
				t.Fatal("replay created another revision", err)
			}
		})
	}
}

func TestCorrectionStoreRevisionConflictReplayAndRestore(t *testing.T) {
	ctx := context.Background()
	base, ch, sample, request := correctionExample()
	input := []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}}
	root := t.TempDir()
	store := NewCorrectionStore(root)
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	cmd := CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "first", Reason: "review", LocalAuthorID: "local"}
	first, err := store.Save(ctx, base, input, cmd)
	if err != nil {
		t.Fatal(err)
	}
	cmd.CommandID = "stale"
	if _, err = store.Save(ctx, base, input, cmd); !errors.Is(err, ErrCorrectionConflict) {
		t.Fatal("stale writer", err)
	}
	cmd.CommandID = "undo"
	cmd.ExpectedRevision = first.HeadID
	restored, err := store.Save(ctx, base, nil, cmd)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Revision.Snapshot.SnapshotID != initial.SnapshotID || restored.Revision.RevisionID == initial.SnapshotID {
		t.Fatal("restore rewrote history")
	}
	cmd.CommandID = "first"
	cmd.ExpectedRevision = initial.SnapshotID
	replay, err := NewCorrectionStore(root).Save(ctx, base, input, cmd)
	if err != nil || replay.Revision.RevisionID != first.Revision.RevisionID || replay.HeadID != restored.HeadID {
		t.Fatal("old replay lost current head", err)
	}
	cmd.Reason = "different"
	if _, err = store.Save(ctx, base, input, cmd); !errors.Is(err, ErrCorrectionConflict) {
		t.Fatal("command reused", err)
	}
	loaded, err := NewCorrectionStore(root).Load(ctx, base, first.Revision.RevisionID)
	if err != nil || loaded.Revision.Snapshot.Corrections[0].Original != request.Expected {
		t.Fatal("history not retained", err)
	}
}

func TestCorrectionStoreResolvesExactCommandWithoutWriting(t *testing.T) {
	ctx := context.Background()
	base, channel, sample, request := correctionExample()
	store := NewCorrectionStore(t.TempDir())
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	command := CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "uncertain", Reason: "review", LocalAuthorID: "local"}
	missing, err := store.ResolveCommand(ctx, base, []SampleValueCorrection{request}, command)
	if err != nil || missing.Found || missing.Revision != nil || missing.HeadID != initial.SnapshotID {
		t.Fatal("missing command", missing, err)
	}
	first, err := store.Save(ctx, base, []SampleCorrectionInput{{Channel: channel, Sample: sample, Request: request}}, command)
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.Save(ctx, base, nil, CorrectionSaveCommand{ExpectedRevision: first.HeadID, CommandID: "later", Reason: "restore", LocalAuthorID: "local"})
	if err != nil {
		t.Fatal(err)
	}
	store.writeFile = func(string, []byte) error {
		t.Error("resolution attempted a write")
		return errors.New("unexpected write")
	}
	found, err := store.ResolveCommand(ctx, base, []SampleValueCorrection{request}, command)
	if err != nil || !found.Found || found.Revision == nil || found.Revision.RevisionID != first.HeadID || found.HeadID != second.HeadID {
		t.Fatal("lost historical command/current head", found, err)
	}
	changed := command
	changed.Reason = "different payload"
	if _, err := store.ResolveCommand(ctx, base, []SampleValueCorrection{request}, changed); !errors.Is(err, ErrCorrectionConflict) {
		t.Fatal("accepted changed command", err)
	}
	changed.CommandID = "never-written"
	missing, err = store.ResolveCommand(ctx, base, nil, changed)
	if err != nil || missing.Found || missing.HeadID != second.HeadID {
		t.Fatal("missing after another writer", missing, err)
	}
	_, lease, err := store.lock(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	_, resolutionErr := store.ResolveCommand(ctx, base, nil, changed)
	if err := lease.Close(); err != nil {
		t.Fatal(err)
	}
	if !errors.Is(resolutionErr, ErrCorrectionWriteInProgress) {
		t.Fatal("reported absence while writer held lease", resolutionErr)
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := store.ResolveCommand(cancelled, base, nil, changed); !errors.Is(err, context.Canceled) {
		t.Fatal("ignored cancellation", err)
	}
}

func TestCorrectionStoreRecoveryAndMissingRevision(t *testing.T) {
	ctx := context.Background()
	base, ch, sample, request := correctionExample()
	root := t.TempDir()
	store := NewCorrectionStore(root)
	initial, initialErr := PrepareSampleCorrectionSnapshot(base, nil)
	if initialErr != nil {
		t.Fatal(initialErr)
	}
	first, err := store.Save(ctx, base, []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}}, CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "a", Reason: "review", LocalAuthorID: "local"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.Save(ctx, base, nil, CorrectionSaveCommand{ExpectedRevision: first.HeadID, CommandID: "b", Reason: "undo", LocalAuthorID: "local"})
	if err != nil {
		t.Fatal(err)
	}
	digest, digestErr := base.Digest()
	if digestErr != nil {
		t.Fatal(digestErr)
	}
	path := filepath.Join(root, "corrections", digest+".json")
	if err := os.WriteFile(path, []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Load(ctx, base, second.HeadID); !errors.Is(err, ErrCorrectionRevisionMissing) {
		t.Fatal("lost revision silently substituted", err)
	}
	if _, err := store.Load(ctx, base, first.HeadID); err != nil {
		t.Fatal("backup not recovered", err)
	}
	if err := os.WriteFile(path, []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path+".bak", []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Load(ctx, base, first.HeadID); !errors.Is(err, ErrCorruptCorrections) {
		t.Fatal("corruption hidden", err)
	}
}

func TestCorrectionStoreCancellationAndLease(t *testing.T) {
	base, _, _, _ := correctionExample()
	root := t.TempDir()
	store := NewCorrectionStore(root)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := store.Load(ctx, base, ""); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	digest, digestErr := base.Digest()
	if digestErr != nil {
		t.Fatal(digestErr)
	}
	dir := filepath.Join(root, "corrections")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	lease, err := acquireCorrectionLease(filepath.Join(dir, digest+".lock"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := lease.Close(); err != nil {
			t.Error(err)
		}
	}()
	if _, err := store.Load(context.Background(), base, ""); !errors.Is(err, ErrCorrectionWriteInProgress) {
		t.Fatal("lease bypassed", err)
	}
}

func TestCorrectionStoreUncertainFirstCommitReplay(t *testing.T) {
	for _, failBackup := range []bool{true, false} {
		t.Run(fmt.Sprint(failBackup), func(t *testing.T) {
			base, ch, sample, request := correctionExample()
			store := NewCorrectionStore(t.TempDir())
			initial, err := PrepareSampleCorrectionSnapshot(base, nil)
			if err != nil {
				t.Fatal(err)
			}
			cmd := CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "retry", Reason: "review", LocalAuthorID: "local"}
			inputs := []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}}
			store.writeFile = func(path string, data []byte) error {
				if err := writeAuthorizedSessionFile(path, data); err != nil {
					return err
				}
				if strings.HasSuffix(path, ".bak") == failBackup {
					return errors.New("lost acknowledgement")
				}
				return nil
			}
			if result, err := store.Save(context.Background(), base, inputs, cmd); !errors.Is(err, ErrCorrectionCommitUncertain) || result.HeadID != "" {
				t.Fatal("false durable acknowledgement", err)
			}
			store.writeFile = writeAuthorizedSessionFile
			resolved, err := store.ResolveCommand(context.Background(), base, []SampleValueCorrection{request}, cmd)
			if err != nil || !resolved.Found || resolved.Revision == nil {
				t.Fatal("cannot resolve uncertain durable candidate", err)
			}
			result, err := store.Save(context.Background(), base, inputs, cmd)
			if err != nil || result.HeadID == "" {
				t.Fatal("cannot replay durable candidate", err)
			}
			loaded, err := store.Load(context.Background(), base, result.HeadID)
			if err != nil || loaded.Revision.Command.CommandID != "retry" {
				t.Fatal(err)
			}
		})
	}
}

func TestCorrectionStoreConcurrentWriters(t *testing.T) {
	base, ch, sample, request := correctionExample()
	root := t.TempDir()
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	for _, id := range []string{"one", "two"} {
		go func(id string) {
			<-start
			_, err := NewCorrectionStore(root).Save(context.Background(), base, []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}}, CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: id, Reason: "review", LocalAuthorID: "local"})
			results <- err
		}(id)
	}
	close(start)
	wins := 0
	for range 2 {
		err := <-results
		if err == nil {
			wins++
		} else if !errors.Is(err, ErrCorrectionConflict) && !errors.Is(err, ErrCorrectionWriteInProgress) {
			t.Fatal(err)
		}
	}
	if wins != 1 {
		t.Fatalf("%d writers committed", wins)
	}
}

func TestCorrectionDocumentRejectsTamperedSnapshotAndQuota(t *testing.T) {
	base, ch, sample, request := correctionExample()
	store := NewCorrectionStore(t.TempDir())
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.Save(context.Background(), base, []SampleCorrectionInput{{Channel: ch, Sample: sample, Request: request}}, CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "a", Reason: "review", LocalAuthorID: "local"})
	if err != nil {
		t.Fatal(err)
	}
	digest, err := base.Digest()
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(store.root, digest+".json"))
	if err != nil {
		t.Fatal(err)
	}
	doc, err := decodeCorrectionDocument(data, base)
	if err != nil {
		t.Fatal(err)
	}
	doc.Revisions[0].Snapshot.Corrections[0].Corrected.Scalar.Number = 88
	corrupt, err := encodeCorrectionDocument(doc)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = decodeCorrectionDocument(corrupt, base); !errors.Is(err, ErrCorruptCorrections) {
		t.Fatal("tampering accepted", err)
	}
	if _, err = encodeCorrectionDocument(correctionDocument{HeadID: strings.Repeat("x", maxCorrectionDocumentBytes)}); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("quota bypassed", err)
	}
}

func mixedClassificationStoreExample(t *testing.T) (SourceAnalysisRef, ObservationCorrectionInput, CorrectionSaveCommand) {
	t.Helper()
	base, input, command := observationStoreExample(t)
	input.Session = mixedSnapshotSession(base)
	input.Classifications = mixedSnapshotClassRequests(base)
	command.CommandID = "mixed-class"
	return base, input, command
}

func TestMixedStoreSavesThreeGroupsAndReloadsAfterRestart(t *testing.T) {
	ctx := context.Background()
	base, input, command := mixedClassificationStoreExample(t)
	root := t.TempDir()
	store := NewCorrectionStore(root)
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := saved.Revision.Snapshot
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v3" || len(snapshot.Corrections) != 1 || len(snapshot.FamilyUses) != 1 || len(snapshot.Classifications) != 2 {
		t.Fatalf("wrong v3 revision: %+v", snapshot)
	}
	loaded, err := NewCorrectionStore(root).Load(ctx, base, saved.HeadID)
	if err != nil || loaded.Revision.Snapshot.SnapshotID != snapshot.SnapshotID || loaded.HeadID != saved.HeadID {
		t.Fatal("restart lost mixed classification revision", err)
	}
}

func TestMixedStoreSavesClassificationAlone(t *testing.T) {
	ctx := context.Background()
	base, input, command := mixedClassificationStoreExample(t)
	input.Samples = nil
	input.FamilyUses = []LapFamilyUseCorrection{}
	store := NewCorrectionStore(t.TempDir())
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := saved.Revision.Snapshot
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v3" || len(snapshot.Corrections) != 0 || len(snapshot.FamilyUses) != 0 || len(snapshot.Classifications) != 2 {
		t.Fatalf("wrong classification-only revision: %+v", snapshot)
	}
	loaded, err := store.Load(ctx, base, saved.HeadID)
	if err != nil || loaded.Revision.Snapshot.SnapshotID != snapshot.SnapshotID {
		t.Fatal("classification-only revision not loadable", err)
	}
}

func TestMixedStoreResolvesExactCommandWithoutSilentMatch(t *testing.T) {
	ctx := context.Background()
	base, input, command := mixedClassificationStoreExample(t)
	store := NewCorrectionStore(t.TempDir())
	requests := []SampleValueCorrection{input.Samples[0].Request}
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	store.writeFile = func(string, []byte) error { t.Error("resolution wrote history"); return errors.New("unexpected write") }
	found, err := store.ResolveMixedCommand(ctx, base, requests, input.FamilyUses, input.Classifications, command)
	if err != nil || !found.Found || found.Revision == nil || found.Revision.RevisionID != saved.HeadID || found.HeadID != saved.HeadID {
		t.Fatal("cannot resolve exact mixed command", found, err)
	}
	changed := append([]ClassificationCorrection(nil), input.Classifications...)
	changed[0].Reason = "Changed payload"
	if _, err := store.ResolveMixedCommand(ctx, base, requests, input.FamilyUses, changed, command); !errors.Is(err, ErrCorrectionConflict) {
		t.Fatal("ignored classification payload change", err)
	}
	if _, err := store.ResolveMixedCommand(ctx, base, requests, input.FamilyUses, nil, command); !errors.Is(err, ErrCorrectionConflict) {
		t.Fatal("silently matched revision without classification payload", err)
	}
}

func TestMixedStoreLegacyGuardsKeepUnknownGroups(t *testing.T) {
	ctx := context.Background()
	base, input, command := mixedClassificationStoreExample(t)
	store := NewCorrectionStore(t.TempDir())
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	legacy := CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: "legacy", Reason: "old client", LocalAuthorID: "local"}
	if _, err := store.Save(ctx, base, input.Samples, legacy); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("legacy caller erased unknown groups", err)
	}
	familyOnly := input
	familyOnly.Classifications = nil
	older := CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: "family-client", Reason: "T11 client", LocalAuthorID: "local"}
	if _, err := store.SaveObservations(ctx, base, familyOnly, older); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("family client erased unknown classifications", err)
	}
	replay, err := store.SaveObservations(ctx, base, input, command)
	if err != nil || replay.Revision.RevisionID != saved.Revision.RevisionID || replay.HeadID != saved.HeadID {
		t.Fatal("exact mixed replay not idempotent", err)
	}
}

func TestMixedStoreRestoresGroupsWithoutRewritingHistory(t *testing.T) {
	ctx := context.Background()
	base, input, command := mixedClassificationStoreExample(t)
	store := NewCorrectionStore(t.TempDir())
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	clearFamilies := input
	clearFamilies.FamilyUses = []LapFamilyUseCorrection{}
	familyCmd := CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: "clear-families", Reason: "Restore original family selection", LocalAuthorID: "local"}
	restored, err := store.SaveObservations(ctx, base, clearFamilies, familyCmd)
	if err != nil || len(restored.Revision.Snapshot.FamilyUses) != 0 || len(restored.Revision.Snapshot.Classifications) != 2 {
		t.Fatal("explicit family restoration dropped classifications", err)
	}
	clearAll := clearFamilies
	clearAll.Classifications = []ClassificationCorrection{}
	scalarCmd := CorrectionSaveCommand{ExpectedRevision: restored.HeadID, CommandID: "clear-all", Reason: "Restore original session", LocalAuthorID: "local"}
	scalarOnly, err := store.SaveObservations(ctx, base, clearAll, scalarCmd)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := PrepareSampleCorrectionSnapshot(base, input.Samples)
	if err != nil || scalarOnly.Revision.Snapshot.SnapshotID != plain.SnapshotID || scalarOnly.Revision.Snapshot.ContractVersion != "analysis.sample-snapshot.v1" {
		t.Fatal("restoration did not return to exact v1", err)
	}
	old, err := store.Load(ctx, base, saved.HeadID)
	if err != nil || len(old.Revision.Snapshot.FamilyUses) != 1 || len(old.Revision.Snapshot.Classifications) != 2 || old.HeadID != scalarOnly.HeadID {
		t.Fatal("restoration deleted historical v3 revision", err)
	}
}

func TestMixedStoreRejectsInvalidClassificationWithoutWriting(t *testing.T) {
	ctx := context.Background()
	base, input, command := mixedClassificationStoreExample(t)
	store := NewCorrectionStore(t.TempDir())
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	mutate := func(f func(*ObservationCorrectionInput)) ObservationCorrectionInput {
		bad := input
		bad.Classifications = append([]ClassificationCorrection(nil), input.Classifications...)
		bad.Session.Metadata = append([]HistoricalMetadata(nil), input.Session.Metadata...)
		f(&bad)
		return bad
	}
	for _, tc := range []struct {
		name  string
		input ObservationCorrectionInput
		want  error
	}{
		{"discordant original", mutate(func(b *ObservationCorrectionInput) { b.Classifications[0].ExpectedOriginal = "practice" }), ErrCorrectionPrecondition},
		{"unknown metadata quality", mutate(func(b *ObservationCorrectionInput) {
			for i, entry := range b.Session.Metadata {
				if entry.Key == "WeatherConditions" {
					b.Session.Metadata[i].Quality = QualityUnknown
				}
			}
		}), ErrInvalidSessionClassification},
		{"changed session parser", mutate(func(b *ObservationCorrectionInput) { b.Session.Provenance.Parser.Version = "2" }), ErrCorrectionInterpretationChanged},
	} {
		t.Run(tc.name, func(t *testing.T) {
			next := CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: "bad-" + tc.name, Reason: "invalid classification", LocalAuthorID: "local"}
			if result, err := store.SaveObservations(ctx, base, tc.input, next); !errors.Is(err, tc.want) || result.HeadID != "" {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
			loaded, err := store.Load(ctx, base, saved.HeadID)
			if err != nil || loaded.HeadID != saved.HeadID {
				t.Fatal("rejected save moved head", err)
			}
		})
	}
}

func TestMixedStoreLegacyScalarGuardOnClassificationOnlyHead(t *testing.T) {
	ctx := context.Background()
	base, input, command := mixedClassificationStoreExample(t)
	input.Samples = nil
	input.FamilyUses = []LapFamilyUseCorrection{}
	store := NewCorrectionStore(t.TempDir())
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	legacy := CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: "legacy", Reason: "old client", LocalAuthorID: "local"}
	if _, err := store.Save(ctx, base, nil, legacy); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("legacy scalar caller erased classification-only head", err)
	}
}

func TestMixedStoreWithdrawsOnlyClassificationsBackToV2(t *testing.T) {
	ctx := context.Background()
	base, input, command := mixedClassificationStoreExample(t)
	store := NewCorrectionStore(t.TempDir())
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	withdraw := input
	withdraw.Classifications = []ClassificationCorrection{}
	dropCmd := CorrectionSaveCommand{ExpectedRevision: saved.HeadID, CommandID: "drop-class", Reason: "Restore original classification", LocalAuthorID: "local"}
	dropped, err := store.SaveObservations(ctx, base, withdraw, dropCmd)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := PrepareObservationCorrectionSnapshot(base, input.Samples, input.Original, input.FamilyUses)
	if err != nil || dropped.Revision.Snapshot.SnapshotID != plain.SnapshotID || dropped.Revision.Snapshot.ContractVersion != "analysis.observation-snapshot.v2" {
		t.Fatal("withdrawal did not return to exact v2", err)
	}
	if len(dropped.Revision.Snapshot.Corrections) != 1 || len(dropped.Revision.Snapshot.FamilyUses) != 1 || len(dropped.Revision.Snapshot.Classifications) != 0 {
		t.Fatalf("wrong withdrawn shape: %+v", dropped.Revision.Snapshot)
	}
	replay, err := store.SaveObservations(ctx, base, input, command)
	if err != nil || replay.Revision.RevisionID != saved.Revision.RevisionID || replay.HeadID != dropped.HeadID {
		t.Fatal("old v3 replay lost current head", err)
	}
	store.writeFile = func(string, []byte) error { t.Error("resolution wrote history"); return errors.New("unexpected write") }
	requests := []SampleValueCorrection{input.Samples[0].Request}
	found, err := store.ResolveMixedCommand(ctx, base, requests, input.FamilyUses, input.Classifications, command)
	if err != nil || !found.Found || found.Revision == nil || found.Revision.RevisionID != saved.Revision.RevisionID || found.HeadID != dropped.HeadID {
		t.Fatal("old v3 command did not resolve to old revision plus current head", found, err)
	}
}

func TestMixedStoreRecoversUncertainClassificationCommit(t *testing.T) {
	ctx := context.Background()
	base, input, command := mixedClassificationStoreExample(t)
	store := NewCorrectionStore(t.TempDir())
	store.writeFile = func(path string, data []byte) error {
		if err := writeAuthorizedSessionFile(path, data); err != nil {
			return err
		}
		if !strings.HasSuffix(path, ".bak") {
			return errors.New("lost acknowledgement")
		}
		return nil
	}
	if result, err := store.SaveObservations(ctx, base, input, command); !errors.Is(err, ErrCorrectionCommitUncertain) || result.HeadID != "" {
		t.Fatal("false durable mixed acknowledgement", err)
	}
	store.writeFile = writeAuthorizedSessionFile
	requests := []SampleValueCorrection{input.Samples[0].Request}
	found, err := store.ResolveMixedCommand(ctx, base, requests, input.FamilyUses, input.Classifications, command)
	if err != nil || !found.Found || found.Revision == nil || len(found.Revision.Snapshot.Classifications) != 2 {
		t.Fatal("lost uncertain classification command", err)
	}
	replay, err := store.SaveObservations(ctx, base, input, command)
	if err != nil || replay.HeadID != found.Revision.RevisionID {
		t.Fatal("replay created another revision", err)
	}
}
