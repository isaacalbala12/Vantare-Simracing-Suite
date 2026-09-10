package telemetryanalysis

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"reflect"
	"sort"
	"time"
)

func correctionCommandDigest(base SourceAnalysisRef, command CorrectionSaveCommand, requests []SampleValueCorrection) (string, error) {
	ordered := append([]SampleValueCorrection{}, requests...)
	sort.Slice(ordered, func(i, j int) bool {
		a, b := ordered[i].Target, ordered[j].Target
		if a.ChannelID != b.ChannelID {
			return a.ChannelID < b.ChannelID
		}
		if a.Column != b.Column {
			return a.Column < b.Column
		}
		return a.SampleIndex < b.SampleIndex
	})
	return correctionDigest("analysis.correction-command.v1", struct {
		Base     SourceAnalysisRef       `json:"base"`
		Command  CorrectionSaveCommand   `json:"command"`
		Requests []SampleValueCorrection `json:"requests"`
	}{base, command, ordered})
}
func correctionRevisionDigest(revision CorrectionRevision) (string, error) {
	revision.RevisionID = ""
	return correctionDigest("analysis.correction-revision.v1", revision)
}

func correctionCommandDigestWithFamilies(base SourceAnalysisRef, command CorrectionSaveCommand, requests []SampleValueCorrection, families []LapFamilyUseCorrection) (string, error) {
	scalarDigest, err := correctionCommandDigest(base, command, requests)
	if err != nil || len(families) == 0 {
		return scalarDigest, err
	}
	prepared, err := prepareStoredLapFamilyCorrections(base, families)
	if err != nil {
		return "", err
	}
	ordered := make([]LapFamilyUseCorrection, len(prepared))
	for i, correction := range prepared {
		ordered[i] = correction.Request
	}
	return correctionDigest("analysis.observation-command.v2", struct {
		ScalarCommandDigest string                   `json:"scalarCommandDigest"`
		FamilyUses          []LapFamilyUseCorrection `json:"familyUses"`
	}{scalarDigest, ordered})
}

// correctionCommandDigestMixed extends the same command identity with the
// classification set. Without classifications it returns the v1/v2 digest
// unchanged, preserving historical hashes. The stored helper only checks
// representation integrity, never source authority or live quality.
func correctionCommandDigestMixed(base SourceAnalysisRef, command CorrectionSaveCommand, requests []SampleValueCorrection, families []LapFamilyUseCorrection, classes []ClassificationCorrection) (string, error) {
	previous, err := correctionCommandDigestWithFamilies(base, command, requests, families)
	if err != nil || len(classes) == 0 {
		return previous, err
	}
	prepared, err := prepareStoredClassificationCorrections(base, classes)
	if err != nil {
		return "", err
	}
	ordered := make([]ClassificationCorrection, len(prepared))
	for i, correction := range prepared {
		ordered[i] = correction.Request
	}
	return correctionDigest("analysis.mixed-command.v3", struct {
		PreviousCommandDigest string                     `json:"previousCommandDigest"`
		Classifications       []ClassificationCorrection `json:"classifications"`
	}{previous, ordered})
}
func encodeCorrectionDocument(doc correctionDocument) ([]byte, error) {
	data, err := json.Marshal(doc)
	if err != nil {
		return nil, fmt.Errorf("encode corrections: %w", err)
	}
	if len(data) > maxCorrectionDocumentBytes {
		return nil, fmt.Errorf("%w: document quota", ErrInvalidCorrection)
	}
	return data, nil
}
func readCorrectionFile(path string) (data []byte, err error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := file.Close(); err == nil {
			err = closeErr
		}
	}()
	data, err = io.ReadAll(io.LimitReader(file, maxCorrectionDocumentBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxCorrectionDocumentBytes {
		return nil, fmt.Errorf("%w: document quota", ErrCorruptCorrections)
	}
	return data, nil
}
func decodeCorrectionDocument(data []byte, base SourceAnalysisRef) (correctionDocument, error) {
	var doc correctionDocument
	invalid := func() (correctionDocument, error) { return correctionDocument{}, ErrCorruptCorrections }
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&doc); err != nil {
		return invalid()
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return invalid()
	}
	if doc.Version != 1 || doc.Base != base || doc.Revisions == nil || len(doc.Revisions) > maxCorrectionRevisions {
		return invalid()
	}
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		return invalid()
	}
	head := initial.SnapshotID
	commands := make(map[string]bool, len(doc.Revisions))
	for _, revision := range doc.Revisions {
		cmd := revision.Command
		if revision.ParentRevisionID != head || cmd.ExpectedRevision != head || commands[cmd.CommandID] || !correctionText(cmd.CommandID, 256) || !correctionText(cmd.LocalAuthorID, 256) || !correctionText(cmd.Reason, 1024) {
			return invalid()
		}
		created, err := time.Parse(time.RFC3339Nano, revision.CreatedAt)
		if err != nil || created.UTC().Format(time.RFC3339Nano) != revision.CreatedAt {
			return invalid()
		}
		if len(revision.Snapshot.Corrections)+len(revision.Snapshot.FamilyUses)+len(revision.Snapshot.Classifications) > MaxSampleCorrections {
			return invalid()
		}
		inputs := make([]SampleCorrectionInput, len(revision.Snapshot.Corrections))
		requests := make([]SampleValueCorrection, len(inputs))
		for i, correction := range revision.Snapshot.Corrections {
			r := correction.Request
			requests[i] = r
			// Revalidate the stored representation for internal consistency only.
			// These reconstructed values never replace live source authorization.
			inputs[i] = SampleCorrectionInput{Request: r, Channel: HistoricalChannel{ID: r.Target.ChannelID, Unit: r.Unit, Columns: []HistoricalColumn{{Name: r.Target.Column, Type: r.Expected.Scalar.Kind}}}, Sample: HistoricalSample{Index: r.Target.SampleIndex, Values: []HistoricalValue{r.Expected}}}
		}
		snapshot, err := PrepareSampleCorrectionSnapshot(base, inputs)
		if err != nil {
			return invalid()
		}
		familyRequests := make([]LapFamilyUseCorrection, len(revision.Snapshot.FamilyUses))
		for i, correction := range revision.Snapshot.FamilyUses {
			familyRequests[i] = correction.Request
		}
		families, err := prepareStoredLapFamilyCorrections(base, familyRequests)
		if err != nil {
			return invalid()
		}
		classRequests := make([]ClassificationCorrection, len(revision.Snapshot.Classifications))
		for i, correction := range revision.Snapshot.Classifications {
			classRequests[i] = correction.Request
		}
		classes, err := prepareStoredClassificationCorrections(base, classRequests)
		if err != nil {
			return invalid()
		}
		snapshot, err = combineMixedSnapshot(snapshot, families, classes)
		if err != nil || !reflect.DeepEqual(snapshot, revision.Snapshot) {
			return invalid()
		}
		digest, err := correctionCommandDigestMixed(base, cmd, requests, familyRequests, classRequests)
		if err != nil || digest != revision.CommandDigest {
			return invalid()
		}
		id, err := correctionRevisionDigest(revision)
		if err != nil || id != revision.RevisionID {
			return invalid()
		}
		commands[cmd.CommandID] = true
		head = revision.RevisionID
	}
	if head != doc.HeadID {
		return invalid()
	}
	return doc, nil
}
