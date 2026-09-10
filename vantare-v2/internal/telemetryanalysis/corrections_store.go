package telemetryanalysis

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const maxCorrectionRevisions = 256
const maxCorrectionDocumentBytes = 8 << 20

var (
	ErrCorrectionConflict        = errors.New("correction revision conflict")
	ErrCorrectionRevisionMissing = errors.New("correction revision missing")
	ErrCorruptCorrections        = errors.New("corrupt correction history")
	ErrCorrectionWriteInProgress = errors.New("correction write in progress")
	ErrCorrectionCommitUncertain = errors.New("correction commit uncertain")
)

type CorrectionSaveCommand struct {
	ExpectedRevision string `json:"expectedRevision"`
	CommandID        string `json:"commandId"`
	Reason           string `json:"reason"`
	LocalAuthorID    string `json:"localAuthorId"`
}
type CorrectionRevision struct {
	RevisionID       string                           `json:"revisionId"`
	ParentRevisionID string                           `json:"parentRevisionId"`
	Command          CorrectionSaveCommand            `json:"command"`
	CommandDigest    string                           `json:"commandDigest"`
	CreatedAt        string                           `json:"createdAt"`
	Snapshot         PreparedSampleCorrectionSnapshot `json:"snapshot"`
}
type CorrectionStoreResult struct {
	Revision CorrectionRevision `json:"revision"`
	HeadID   string             `json:"headId"`
}

type CorrectionCommandResolution struct {
	Found    bool                `json:"found"`
	HeadID   string              `json:"headId"`
	Revision *CorrectionRevision `json:"revision,omitempty"`
}

// ObservationCorrectionInput is assembled by Analysis from authorized original
// data and scalar reanalysis. It is not a client DTO. Non-nil FamilyUses denotes
// an explicit complete set, including explicit removal of all family decisions.
// The same holds for Classifications: nil means the caller is unaware of the
// group and must never silently drop it, while an explicit (possibly empty)
// set replaces it. Session carries the original session for classification.
type ObservationCorrectionInput struct {
	Samples         []SampleCorrectionInput
	Original        LapValidityAnalysis
	Effective       LapValidityAnalysis
	FamilyUses      []LapFamilyUseCorrection
	Session         HistoricalSession
	Classifications []ClassificationCorrection
}
type correctionDocument struct {
	Version   int                  `json:"version"`
	Base      SourceAnalysisRef    `json:"base"`
	HeadID    string               `json:"headId"`
	Revisions []CorrectionRevision `json:"revisions"`
}

// CorrectionStore owns only private revision custody. The Analysis service must
// verify current source authorization before every call, including replays.
// Neither a base digest nor stored history grants authorization to source data.
type CorrectionStore struct {
	root      string
	writeFile func(string, []byte) error
}

func NewCorrectionStore(privateRoot string) *CorrectionStore {
	return &CorrectionStore{root: filepath.Join(privateRoot, "corrections"), writeFile: writeAuthorizedSessionFile}
}
func (s *CorrectionStore) lock(ctx context.Context, base SourceAnalysisRef) (string, correctionLease, error) {
	if err := ctx.Err(); err != nil {
		return "", nil, err
	}
	digest, err := base.Digest()
	if err != nil {
		return "", nil, err
	}
	if err := os.MkdirAll(s.root, 0700); err != nil {
		return "", nil, fmt.Errorf("create correction directory: %w", err)
	}
	path := filepath.Join(s.root, digest+".json")
	lease, err := acquireCorrectionLease(filepath.Join(s.root, digest+".lock"))
	return path, lease, err
}
func (s *CorrectionStore) Load(ctx context.Context, base SourceAnalysisRef, revisionID string) (result CorrectionStoreResult, err error) {
	path, lease, err := s.lock(ctx, base)
	if err != nil {
		return result, err
	}
	defer func() { err = errors.Join(err, lease.Close()) }()
	doc, _, err := s.read(path, base)
	if err != nil {
		return result, err
	}
	if err := ctx.Err(); err != nil {
		return result, err
	}
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		return result, err
	}
	if revisionID == "" {
		revisionID = doc.HeadID
	}
	if revisionID == initial.SnapshotID {
		return CorrectionStoreResult{Revision: CorrectionRevision{RevisionID: revisionID, Snapshot: initial}, HeadID: doc.HeadID}, nil
	}
	for _, revision := range doc.Revisions {
		if revision.RevisionID == revisionID {
			return CorrectionStoreResult{revision, doc.HeadID}, nil
		}
	}
	return result, ErrCorrectionRevisionMissing
}
func (s *CorrectionStore) Save(ctx context.Context, base SourceAnalysisRef, inputs []SampleCorrectionInput, command CorrectionSaveCommand) (result CorrectionStoreResult, err error) {
	if len(inputs) > MaxSampleCorrections {
		return result, ErrInvalidCorrection
	}
	requests := make([]SampleValueCorrection, len(inputs))
	for i := range inputs {
		requests[i] = inputs[i].Request
	}
	commandDigest, err := validatedCorrectionCommandDigest(base, command, requests)
	if err != nil {
		return result, err
	}
	return s.saveValidated(ctx, base, ObservationCorrectionInput{Samples: inputs}, command, commandDigest)
}

func (s *CorrectionStore) SaveObservations(ctx context.Context, base SourceAnalysisRef, input ObservationCorrectionInput, command CorrectionSaveCommand) (CorrectionStoreResult, error) {
	if input.FamilyUses == nil || len(input.Samples)+len(input.FamilyUses)+len(input.Classifications) > MaxSampleCorrections {
		return CorrectionStoreResult{}, ErrInvalidCorrection
	}
	requests := make([]SampleValueCorrection, len(input.Samples))
	for i, sample := range input.Samples {
		requests[i] = sample.Request
	}
	digest, err := validatedMixedCommandDigest(base, command, requests, input.FamilyUses, input.Classifications)
	if err != nil {
		return CorrectionStoreResult{}, err
	}
	return s.saveValidated(ctx, base, input, command, digest)
}

// ResolveCommand checks the exact command without another write. The same lease
// as Save prevents reporting absence while that writer still owns the document.
func (s *CorrectionStore) ResolveCommand(ctx context.Context, base SourceAnalysisRef, requests []SampleValueCorrection, command CorrectionSaveCommand) (result CorrectionCommandResolution, err error) {
	digest, err := validatedCorrectionCommandDigest(base, command, requests)
	if err != nil {
		return result, err
	}
	return s.resolveValidatedCommand(ctx, base, command, digest)
}

func (s *CorrectionStore) ResolveObservationsCommand(ctx context.Context, base SourceAnalysisRef, requests []SampleValueCorrection, families []LapFamilyUseCorrection, command CorrectionSaveCommand) (CorrectionCommandResolution, error) {
	if families == nil {
		return CorrectionCommandResolution{}, ErrInvalidCorrection
	}
	digest, err := validatedObservationCommandDigest(base, command, requests, families)
	if err != nil {
		return CorrectionCommandResolution{}, err
	}
	return s.resolveValidatedCommand(ctx, base, command, digest)
}

// ResolveMixedCommand resolves a command carrying classification decisions
// with exactly the same digest function as SaveObservations. Omitting the
// classification payload never matches a revision that stores it: the digest
// differs and the resolution reports a conflict, never a silent match.
func (s *CorrectionStore) ResolveMixedCommand(ctx context.Context, base SourceAnalysisRef, requests []SampleValueCorrection, families []LapFamilyUseCorrection, classes []ClassificationCorrection, command CorrectionSaveCommand) (CorrectionCommandResolution, error) {
	if families == nil {
		return CorrectionCommandResolution{}, ErrInvalidCorrection
	}
	digest, err := validatedMixedCommandDigest(base, command, requests, families, classes)
	if err != nil {
		return CorrectionCommandResolution{}, err
	}
	return s.resolveValidatedCommand(ctx, base, command, digest)
}

func (s *CorrectionStore) resolveValidatedCommand(ctx context.Context, base SourceAnalysisRef, command CorrectionSaveCommand, digest string) (result CorrectionCommandResolution, err error) {
	path, lease, err := s.lock(ctx, base)
	if err != nil {
		return result, err
	}
	defer func() { err = errors.Join(err, lease.Close()) }()
	doc, _, err := s.read(path, base)
	if err != nil {
		return result, err
	}
	if err := ctx.Err(); err != nil {
		return result, err
	}
	for _, revision := range doc.Revisions {
		if revision.Command.CommandID == command.CommandID {
			if revision.CommandDigest != digest {
				return result, ErrCorrectionConflict
			}
			return CorrectionCommandResolution{Found: true, HeadID: doc.HeadID, Revision: &revision}, nil
		}
	}
	return CorrectionCommandResolution{HeadID: doc.HeadID}, nil
}

func validatedObservationCommandDigest(base SourceAnalysisRef, command CorrectionSaveCommand, requests []SampleValueCorrection, families []LapFamilyUseCorrection) (string, error) {
	if len(requests)+len(families) > MaxSampleCorrections {
		return "", ErrInvalidCorrection
	}
	if _, err := validatedCorrectionCommandDigest(base, command, requests); err != nil {
		return "", err
	}
	return correctionCommandDigestWithFamilies(base, command, requests, families)
}

// validatedMixedCommandDigest is the single digest function shared by Save
// and Resolve for the mixed set. Without classifications it returns the
// v1/v2 digest unchanged, preserving historical hashes.
func validatedMixedCommandDigest(base SourceAnalysisRef, command CorrectionSaveCommand, requests []SampleValueCorrection, families []LapFamilyUseCorrection, classes []ClassificationCorrection) (string, error) {
	if len(requests)+len(families)+len(classes) > MaxSampleCorrections {
		return "", ErrInvalidCorrection
	}
	if _, err := validatedCorrectionCommandDigest(base, command, requests); err != nil {
		return "", err
	}
	return correctionCommandDigestMixed(base, command, requests, families, classes)
}

func validatedCorrectionCommandDigest(base SourceAnalysisRef, command CorrectionSaveCommand, requests []SampleValueCorrection) (string, error) {
	if !correctionText(command.CommandID, 256) || !correctionText(command.LocalAuthorID, 256) || !correctionText(command.Reason, 1024) || !correctionSHA256(command.ExpectedRevision) || len(requests) > MaxSampleCorrections {
		return "", ErrInvalidCorrection
	}
	if _, err := base.Digest(); err != nil {
		return "", err
	}
	for _, request := range requests {
		if _, err := request.Base.Digest(); err != nil {
			return "", err
		}
		if !correctionText(request.Reason, 1024) || !correctionText(request.Target.ChannelID, 256) || !correctionText(request.Target.Column, 256) || len(request.Unit.Symbol) > 256 || len(request.Expected.Column) > 256 || len(request.Expected.Scalar.Text) > 4096 || len(request.Replacement.Text) > 4096 {
			return "", ErrInvalidCorrection
		}
		if !correctionScalar(request.Expected.Scalar, request.Expected.Scalar.Kind) || !correctionScalar(request.Replacement, request.Expected.Scalar.Kind) || request.Unit.Quality != QualityValid {
			return "", ErrCorrectionValue
		}
		switch request.Expected.Quality {
		case QualityValid, QualityStale, QualityMissing, QualityInvalid, QualityUnknown:
		default:
			return "", ErrCorrectionValue
		}
	}
	return correctionCommandDigest(base, command, requests)
}

func (s *CorrectionStore) saveValidated(ctx context.Context, base SourceAnalysisRef, input ObservationCorrectionInput, command CorrectionSaveCommand, commandDigest string) (result CorrectionStoreResult, err error) {
	path, lease, err := s.lock(ctx, base)
	if err != nil {
		return result, err
	}
	defer func() { err = errors.Join(err, lease.Close()) }()
	doc, previous, err := s.read(path, base)
	if err != nil {
		return result, err
	}
	if err := ctx.Err(); err != nil {
		return result, err
	}
	for _, revision := range doc.Revisions {
		if revision.Command.CommandID == command.CommandID {
			if revision.CommandDigest != commandDigest {
				return result, ErrCorrectionConflict
			}
			return CorrectionStoreResult{revision, doc.HeadID}, nil
		}
	}
	if doc.HeadID != command.ExpectedRevision {
		return result, ErrCorrectionConflict
	}
	if input.FamilyUses == nil && len(doc.Revisions) > 0 && len(doc.Revisions[len(doc.Revisions)-1].Snapshot.FamilyUses) > 0 {
		return result, fmt.Errorf("%w: complete family correction set required", ErrInvalidCorrection)
	}
	if input.Classifications == nil && len(doc.Revisions) > 0 && len(doc.Revisions[len(doc.Revisions)-1].Snapshot.Classifications) > 0 {
		return result, fmt.Errorf("%w: complete classification correction set required", ErrInvalidCorrection)
	}
	if len(doc.Revisions) >= maxCorrectionRevisions {
		return result, fmt.Errorf("%w: revision quota", ErrInvalidCorrection)
	}
	snapshot, err := PrepareMixedCorrectionSnapshot(base, input.Samples, input.Original, input.FamilyUses, input.Session, input.Classifications)
	if err != nil {
		return result, err
	}
	if len(snapshot.FamilyUses) > 0 {
		if _, err := ApplyLapFamilyCorrections(base, input.Original, input.Effective, snapshot.FamilyUses); err != nil {
			return result, err
		}
	}
	revision := CorrectionRevision{ParentRevisionID: doc.HeadID, Command: command, CommandDigest: commandDigest, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano), Snapshot: snapshot}
	revision.RevisionID, err = correctionRevisionDigest(revision)
	if err != nil {
		return result, err
	}
	doc.Revisions = append(doc.Revisions, revision)
	doc.HeadID = revision.RevisionID
	data, err := encodeCorrectionDocument(doc)
	if err != nil {
		return result, err
	}
	if err := ctx.Err(); err != nil {
		return result, err
	}
	// Keep a validated recovery generation. First commit's backup is itself a
	// durable candidate: failure after it is written must report uncertainty.
	first := previous == nil
	if first {
		previous = data
	}
	if err := s.writeFile(path+".bak", previous); err != nil {
		if first {
			return result, fmt.Errorf("%w: correction backup: %w", ErrCorrectionCommitUncertain, err)
		}
		return result, fmt.Errorf("correction backup: %w", err)
	}
	if err := s.writeFile(path, data); err != nil {
		return result, fmt.Errorf("%w: %w", ErrCorrectionCommitUncertain, err)
	}
	return CorrectionStoreResult{revision, doc.HeadID}, nil
}
func (s *CorrectionStore) read(path string, base SourceAnalysisRef) (correctionDocument, []byte, error) {
	primary, primaryErr := readCorrectionFile(path)
	if primaryErr == nil {
		if doc, err := decodeCorrectionDocument(primary, base); err == nil {
			return doc, primary, nil
		} else {
			primaryErr = err
		}
	}
	backup, backupErr := readCorrectionFile(path + ".bak")
	if errors.Is(primaryErr, os.ErrNotExist) && errors.Is(backupErr, os.ErrNotExist) {
		initial, err := PrepareSampleCorrectionSnapshot(base, nil)
		return correctionDocument{Version: 1, Base: base, HeadID: initial.SnapshotID, Revisions: []CorrectionRevision{}}, nil, err
	}
	if backupErr != nil {
		return correctionDocument{}, nil, fmt.Errorf("%w: %w", ErrCorruptCorrections, errors.Join(primaryErr, backupErr))
	}
	doc, err := decodeCorrectionDocument(backup, base)
	if err != nil {
		return correctionDocument{}, nil, err
	}
	if !errors.Is(primaryErr, os.ErrNotExist) {
		quarantine := path + ".corrupt-" + time.Now().UTC().Format("20060102T150405.000000000")
		if err := os.Rename(path, quarantine); err != nil {
			return correctionDocument{}, nil, fmt.Errorf("quarantine corrections: %w", err)
		}
	}
	if err := s.writeFile(path, backup); err != nil {
		return correctionDocument{}, nil, fmt.Errorf("restore corrections: %w", err)
	}
	return doc, backup, nil
}
