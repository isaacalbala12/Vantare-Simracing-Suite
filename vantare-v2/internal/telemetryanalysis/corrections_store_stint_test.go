package telemetryanalysis

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"
)

func stintStoreExample(t *testing.T) (SourceAnalysisRef, ObservationCorrectionInput, CorrectionSaveCommand) {
	t.Helper()
	base, validity := stintCorrectionExample(t)
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	input := ObservationCorrectionInput{
		Original: validity, Effective: validity,
		FamilyUses: []LapFamilyUseCorrection{}, StintBoundaries: []StintBoundaryCorrection{stintRemoveRequest(base, validity)},
	}
	command := CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "stint-v5", Reason: "review stint boundary", LocalAuthorID: "local"}
	return base, input, command
}

func TestStintStoreRecoversUncertainCommit(t *testing.T) {
	for _, failBackup := range []bool{true, false} {
		t.Run(fmt.Sprint(failBackup), func(t *testing.T) {
			ctx := context.Background()
			base, input, command := stintStoreExample(t)
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
				t.Fatal("uncertain save reported success", err)
			}
			store.writeFile = writeAuthorizedSessionFile
			found, err := store.ResolveStintMixedCommand(ctx, base, nil, []LapFamilyUseCorrection{}, nil, input.StintBoundaries, command)
			if err != nil || !found.Found || found.Revision == nil || len(found.Revision.Snapshot.StintBoundaries) != 1 {
				t.Fatal("uncertain stint command was not recovered", err)
			}
			replayed, err := store.SaveObservations(ctx, base, input, command)
			if err != nil || replayed.HeadID != found.Revision.RevisionID {
				t.Fatal("uncertain replay created a different revision", err)
			}
		})
	}
}

func TestStintStoreRestartResolveAndExplicitRemoval(t *testing.T) {
	ctx := context.Background()
	base, input, command := stintStoreExample(t)
	root := t.TempDir()
	store := NewCorrectionStore(root)
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil || saved.Revision.Snapshot.ContractVersion != "analysis.mixed-snapshot.v5" {
		t.Fatal("stint snapshot not saved", err)
	}

	store = NewCorrectionStore(root)
	loaded, err := store.Load(ctx, base, saved.HeadID)
	if err != nil || !reflect.DeepEqual(loaded.Revision.Snapshot, saved.Revision.Snapshot) {
		t.Fatal("restart changed v5 snapshot", err)
	}
	found, err := store.ResolveStintMixedCommand(ctx, base, nil, []LapFamilyUseCorrection{}, nil, input.StintBoundaries, command)
	if err != nil || !found.Found || found.Revision == nil || found.Revision.RevisionID != saved.HeadID {
		t.Fatal("exact v5 command not resolved", err)
	}
	changed := append([]StintBoundaryCorrection(nil), input.StintBoundaries...)
	changed[0].Reason = "different review"
	if _, err := store.ResolveStintMixedCommand(ctx, base, nil, []LapFamilyUseCorrection{}, nil, changed, command); !errors.Is(err, ErrCorrectionConflict) {
		t.Fatal("changed stint command matched", err)
	}
	if _, err := store.ResolveMixedCommand(ctx, base, nil, []LapFamilyUseCorrection{}, nil, command); !errors.Is(err, ErrCorrectionConflict) {
		t.Fatal("omitted stint command matched", err)
	}

	next := command
	next.ExpectedRevision = saved.HeadID
	next.CommandID = "remove-stint-v5"
	unaware := input
	unaware.StintBoundaries = nil
	if _, err := store.SaveObservations(ctx, base, unaware, next); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("unaware writer removed active stints", err)
	}
	explicit := input
	explicit.StintBoundaries = []StintBoundaryCorrection{}
	restored, err := store.SaveObservations(ctx, base, explicit, next)
	if err != nil || restored.Revision.Snapshot.ContractVersion != "analysis.sample-snapshot.v1" || len(restored.Revision.Snapshot.StintBoundaries) != 0 {
		t.Fatal("explicit removal did not restore legacy representation", err)
	}
	old, err := store.Load(ctx, base, saved.HeadID)
	if err != nil || len(old.Revision.Snapshot.StintBoundaries) != 1 || old.HeadID != restored.HeadID {
		t.Fatal("explicit removal erased v5 history", err)
	}
}

func TestStintStoreCanonicalIdentityRoundTrip(t *testing.T) {
	ctx := context.Background()
	base, input, command := stintStoreExample(t)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	input.Session = mixedSnapshotSession(base)
	input.Classifications = []ClassificationCorrection{{
		Base: base, Field: ClassificationFieldTrackName, ExpectedOriginal: "Imola", Replacement: "Monza",
		Reason: "reviewed identity", Provenance: ClassificationProvenanceManual, CanonicalCombinationID: target.ID,
	}}
	input.ResolveCanonicalCombination = func(context.Context, string) (CombinationIdentity, error) { return *target, nil }
	root := t.TempDir()
	store := NewCorrectionStore(root)
	saved, err := store.SaveObservations(ctx, base, input, command)
	if err != nil {
		t.Fatal(err)
	}
	store = NewCorrectionStore(root)
	loaded, err := store.Load(ctx, base, saved.HeadID)
	if err != nil || loaded.Revision.Snapshot.ContractVersion != "analysis.mixed-snapshot.v5" || loaded.Revision.Snapshot.CanonicalCombination == nil || loaded.Revision.Snapshot.CanonicalCombination.ID != target.ID || len(loaded.Revision.Snapshot.StintBoundaries) != 1 {
		t.Fatal("identity v5 did not survive restart", err)
	}
}

func TestDecodeStintHistoryRejectsWrongVersionAndRehashedOriginal(t *testing.T) {
	base, input, command := stintStoreExample(t)
	snapshot, err := PrepareStintMixedCorrectionSnapshot(base, nil, input.Original, input.FamilyUses, input.Session, input.Classifications, nil, input.StintBoundaries)
	if err != nil {
		t.Fatal(err)
	}
	digest, err := validatedStintMixedCommandDigest(base, command, nil, input.FamilyUses, nil, input.StintBoundaries)
	if err != nil {
		t.Fatal(err)
	}
	revision := CorrectionRevision{ParentRevisionID: command.ExpectedRevision, Command: command, CommandDigest: digest, CreatedAt: time.Unix(1, 0).UTC().Format(time.RFC3339Nano), Snapshot: snapshot}
	revision.RevisionID, err = correctionRevisionDigest(revision)
	if err != nil {
		t.Fatal(err)
	}
	doc := correctionDocument{Version: 1, Base: base, HeadID: revision.RevisionID, Revisions: []CorrectionRevision{revision}}
	data, err := encodeCorrectionDocument(doc)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeCorrectionDocument(data, base); err != nil {
		t.Fatal("valid v5 document rejected", err)
	}

	wrongVersion := doc
	wrongVersion.Revisions = append([]CorrectionRevision(nil), doc.Revisions...)
	wrongVersion.Revisions[0].Snapshot.ContractVersion = "analysis.mixed-snapshot.v4"
	data, err = encodeCorrectionDocument(wrongVersion)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeCorrectionDocument(data, base); !errors.Is(err, ErrCorruptCorrections) {
		t.Fatal("accepted stint field under v4", err)
	}

	corrupt := doc
	corrupt.Revisions = append([]CorrectionRevision(nil), doc.Revisions...)
	corrupt.Revisions[0].Snapshot.StintBoundaries = append([]PreparedStintBoundaryCorrection(nil), snapshot.StintBoundaries...)
	corrupt.Revisions[0].Snapshot.StintBoundaries[0].Original.Cause = "fuel_jump"
	corrupt.Revisions[0].Snapshot.SnapshotID, err = correctionDigest("analysis.mixed-snapshot.v5", struct {
		Base                 SourceAnalysisRef                  `json:"base"`
		Corrections          []PreparedSampleCorrection         `json:"corrections"`
		FamilyUses           []PreparedLapFamilyUseCorrection   `json:"familyUses"`
		Classifications      []PreparedClassificationCorrection `json:"classifications"`
		CanonicalCombination *CombinationIdentity               `json:"canonicalCombination,omitempty"`
		StintBoundaries      []PreparedStintBoundaryCorrection  `json:"stintBoundaries"`
	}{corrupt.Revisions[0].Snapshot.Base, corrupt.Revisions[0].Snapshot.Corrections, corrupt.Revisions[0].Snapshot.FamilyUses, corrupt.Revisions[0].Snapshot.Classifications, corrupt.Revisions[0].Snapshot.CanonicalCombination, corrupt.Revisions[0].Snapshot.StintBoundaries})
	if err != nil {
		t.Fatal(err)
	}
	corrupt.Revisions[0].RevisionID, err = correctionRevisionDigest(corrupt.Revisions[0])
	if err != nil {
		t.Fatal(err)
	}
	corrupt.HeadID = corrupt.Revisions[0].RevisionID
	data, err = encodeCorrectionDocument(corrupt)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeCorrectionDocument(data, base); !errors.Is(err, ErrCorruptCorrections) {
		t.Fatal("accepted inconsistent stored original with recalculated hashes", err)
	}
}
