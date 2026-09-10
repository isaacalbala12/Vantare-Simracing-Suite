package telemetryanalysis

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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
