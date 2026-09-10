package telemetryanalysis

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"reflect"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
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

// canonicalCombinationReference reports whether id has the resolved-reference
// shape lmu: plus 64 lowercase hex digits. Shape alone never authorizes an
// entry; the catalog resolves membership when preparing a new write.
func canonicalCombinationReference(id string) bool {
	if len(id) != len("lmu:")+64 || !strings.HasPrefix(id, "lmu:") {
		return false
	}
	for _, c := range id[len("lmu:"):] {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// checkCanonicalCommandIdentityRequests validates stored identity request
// representation over a sorted copy: exact base, closed identity fields, one
// common lmu:64hex reference, RAW UTF-8 non-empty expected, raw 1024-byte
// UTF-8 non-empty replacement, manual provenance and reason, no duplicates.
// It never resolves a catalog nor fabricates a canonical tuple from client
// text.
func checkCanonicalCommandIdentityRequests(base SourceAnalysisRef, requests []ClassificationCorrection) ([]ClassificationCorrection, error) {
	if _, err := base.Digest(); err != nil {
		return nil, err
	}
	ordered := append([]ClassificationCorrection{}, requests...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Field < ordered[j].Field })
	var reference string
	seen := make(map[ClassificationField]bool, len(ordered))
	for i, request := range ordered {
		if !isIdentityClassificationField(request.Field) {
			return nil, fmt.Errorf("%w: field %s", ErrCorrectionTarget, request.Field)
		}
		if seen[request.Field] {
			return nil, ErrOverlappingCorrections
		}
		seen[request.Field] = true
		if request.Base != base {
			return nil, ErrCorrectionInterpretationChanged
		}
		if !canonicalCombinationReference(request.CanonicalCombinationID) {
			return nil, fmt.Errorf("%w: canonical combination reference", ErrInvalidCorrection)
		}
		if i == 0 {
			reference = request.CanonicalCombinationID
		} else if request.CanonicalCombinationID != reference {
			return nil, fmt.Errorf("%w: divergent canonical combination reference", ErrCorrectionTarget)
		}
		if !utf8.ValidString(request.ExpectedOriginal) || strings.TrimSpace(request.ExpectedOriginal) == "" {
			return nil, ErrCorrectionPrecondition
		}
		if len(request.Replacement) > 1024 || !utf8.ValidString(request.Replacement) || strings.TrimSpace(request.Replacement) == "" {
			return nil, fmt.Errorf("%w: classification replacement", ErrCorrectionValue)
		}
		if request.Provenance != ClassificationProvenanceManual {
			return nil, fmt.Errorf("%w: provenance", ErrInvalidCorrection)
		}
		if !correctionText(request.Reason, 1024) {
			return nil, fmt.Errorf("%w: reason", ErrInvalidCorrection)
		}
	}
	return ordered, nil
}

// correctionCommandDigestCanonicalMixed extends the command identity with
// resolved-identity decisions under domain analysis.mixed-command.v4.
// Without identity it returns the v1/v2/v3 digest unchanged, preserving
// historical hashes. Legacy groups chain through the previous digest while
// identity requests bind the common reference under the v4 domain.
func correctionCommandDigestCanonicalMixed(base SourceAnalysisRef, command CorrectionSaveCommand, requests []SampleValueCorrection, families []LapFamilyUseCorrection, classes []ClassificationCorrection) (string, error) {
	if len(requests)+len(families)+len(classes) > MaxSampleCorrections {
		return "", fmt.Errorf("%w: at most %d mixed corrections", ErrInvalidCorrection, MaxSampleCorrections)
	}
	identity := false
	for _, class := range classes {
		if isIdentityClassificationField(class.Field) || class.CanonicalCombinationID != "" {
			identity = true
			break
		}
	}
	if !identity {
		return correctionCommandDigestMixed(base, command, requests, families, classes)
	}
	legacy := make([]ClassificationCorrection, 0, len(classes))
	identityRequests := make([]ClassificationCorrection, 0, len(classes))
	for _, class := range classes {
		if isIdentityClassificationField(class.Field) || class.CanonicalCombinationID != "" {
			identityRequests = append(identityRequests, class)
		} else {
			legacy = append(legacy, class)
		}
	}
	previous, err := correctionCommandDigestMixed(base, command, requests, families, legacy)
	if err != nil {
		return "", err
	}
	ordered, err := checkCanonicalCommandIdentityRequests(base, identityRequests)
	if err != nil {
		return "", err
	}
	return correctionDigest("analysis.mixed-command.v4", struct {
		PreviousCommandDigest string                     `json:"previousCommandDigest"`
		Classifications       []ClassificationCorrection `json:"classifications"`
	}{previous, ordered})
}

// hasStoredIdentityActivity reports whether any stored request carries an
// identity decision or reference. A v4 tag without it is inert.
func hasStoredIdentityActivity(requests []ClassificationCorrection) bool {
	for _, request := range requests {
		if isIdentityClassificationField(request.Field) || request.CanonicalCombinationID != "" {
			return true
		}
	}
	return false
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
	// Bounded presence preflight for canonicalCombination, using the same
	// case-insensitive matching as the decoder itself: a typed RawMessage
	// field observes the key in any capitalization, so v1/v2/v3 reject the
	// field even as null. Omission is the old representation.
	var presence struct {
		Revisions []struct {
			Snapshot struct {
				ContractVersion      string          `json:"contractVersion"`
				CanonicalCombination json.RawMessage `json:"canonicalCombination"`
			} `json:"snapshot"`
		} `json:"revisions"`
	}
	if err := json.Unmarshal(data, &presence); err != nil || len(presence.Revisions) != len(doc.Revisions) {
		return invalid()
	}
	for n, revision := range doc.Revisions {
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
		hasTarget := n < len(presence.Revisions) && presence.Revisions[n].Snapshot.CanonicalCombination != nil
		if revision.Snapshot.ContractVersion == "analysis.mixed-snapshot.v4" {
			// v4 requires a persisted non-null target and active identity;
			// the stored snapshot, command and revision chain are
			// recomputed through the current validators and the target.
			if !hasTarget {
				return invalid()
			}
			target := revision.Snapshot.CanonicalCombination
			if target == nil {
				return invalid()
			}
			if !hasStoredIdentityActivity(classRequests) {
				return invalid()
			}
			classes, err := prepareStoredCanonicalClassificationCorrections(base, classRequests, target)
			if err != nil {
				return invalid()
			}
			snapshot, err = combineCanonicalMixedSnapshot(snapshot, families, classes, target)
			if err != nil || !reflect.DeepEqual(snapshot, revision.Snapshot) {
				return invalid()
			}
			digest, err := correctionCommandDigestCanonicalMixed(base, cmd, requests, familyRequests, classRequests)
			if err != nil || digest != revision.CommandDigest {
				return invalid()
			}
		} else {
			// v1/v2/v3 reject any canonicalCombination presence, even null.
			if hasTarget {
				return invalid()
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
