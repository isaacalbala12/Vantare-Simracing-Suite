package contract

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

const (
	testSHA    = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	testDigest = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
)

func TestVersionedDocumentsRoundTrip(t *testing.T) {
	t.Parallel()

	documents := []struct {
		name   string
		value  any
		decode func([]byte) error
	}{
		{name: "report", value: Report{CurrentVersion, "report-1", "tester-1", ChannelNightly, ReportSubmitted}, decode: decodeReport},
		{name: "evidence", value: Evidence{CurrentVersion, "evidence-1", "report-1", EvidenceDiagnostic, testDigest}, decode: decodeEvidence},
		{name: "technical issue", value: TechnicalIssue{CurrentVersion, "issue-1", "report-1", TechnicalIssueOpen}, decode: decodeTechnicalIssue},
		{name: "codex run", value: CodexRun{CurrentVersion, "run-1", "issue-1", 1, CodexRunQueued}, decode: decodeCodexRun},
		{name: "candidate", value: CandidateBuild{CurrentVersion, "candidate-1", "issue-1", ChannelNightly, "0.1.0-nightly.1", testSHA, "codex-1", CandidatePending}, decode: decodeCandidate},
		{name: "validation", value: Validation{CurrentVersion, "validation-1", "candidate-1", ChannelNightly, testSHA, "codex-1", ValidationAccepted, "primary-1", ""}, decode: decodeValidation},
		{name: "promotion", value: Promotion{CurrentVersion, "promotion-1", "candidate-1", ChannelNightly, ChannelTesters, testSHA, testSHA, PromotionAuthorized, "primary-1"}, decode: decodePromotion},
	}

	for _, document := range documents {
		document := document
		t.Run(document.name, func(t *testing.T) {
			t.Parallel()
			encoded, err := json.Marshal(document.value)
			if err != nil {
				t.Fatal(err)
			}
			if err := document.decode(encoded); err != nil {
				t.Fatalf("round trip failed: %v", err)
			}
		})
	}
}

func TestDecodeReportFailsClosed(t *testing.T) {
	t.Parallel()

	base := `{"contractVersion":"testing-center.v1","reportId":"report-1","reporterId":"tester-1","channel":"nightly","state":"submitted"}`
	tests := []struct {
		name     string
		document string
		want     error
	}{
		{name: "future version", document: strings.Replace(base, "testing-center.v1", "testing-center.v2", 1), want: ErrUnsupportedVersion},
		{name: "missing version", document: `{"reportId":"report-1","reporterId":"tester-1","channel":"nightly","state":"submitted"}`, want: ErrInvalidDocument},
		{name: "unknown field", document: strings.TrimSuffix(base, "}") + `,"rawLog":"secret"}`, want: ErrInvalidDocument},
		{name: "duplicate field", document: strings.TrimSuffix(base, "}") + `,"reportId":"report-2"}`, want: ErrInvalidDocument},
		{name: "alternate casing", document: strings.Replace(base, "reportId", "ReportId", 1), want: ErrInvalidDocument},
		{name: "trailing document", document: base + `{}`, want: ErrInvalidDocument},
		{name: "unknown channel", document: strings.Replace(base, "nightly", "preview", 1), want: ErrUnknownChannel},
		{name: "unknown state", document: strings.Replace(base, "submitted", "magic", 1), want: ErrUnknownState},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := DecodeReport([]byte(test.document))
			if !errors.Is(err, test.want) {
				t.Fatalf("DecodeReport() error = %v, want %v", err, test.want)
			}
		})
	}
}

func TestActorMustComeFromVerifiedConstructor(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		create func() (Actor, error)
		want   error
	}{
		{name: "human primary", create: func() (Actor, error) { return NewHumanActor("primary-1", RolePrimaryTester) }},
		{name: "automated orchestrator", create: func() (Actor, error) { return NewAutomatedActor("orchestrator-1", OriginOrchestrator) }},
		{name: "unknown human role", create: func() (Actor, error) { return NewHumanActor("actor-1", Role("admin")) }, want: ErrUnknownRole},
		{name: "automation cannot claim testing center", create: func() (Actor, error) { return NewAutomatedActor("actor-1", OriginTestingCenter) }, want: ErrInvalidDocument},
		{name: "unknown automation origin", create: func() (Actor, error) { return NewAutomatedActor("actor-1", Origin("linear")) }, want: ErrUnknownOrigin},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := test.create()
			if !errors.Is(err, test.want) {
				t.Fatalf("constructor error = %v, want %v", err, test.want)
			}
		})
	}
}

func TestValidationSnapshotCannotAssertRole(t *testing.T) {
	t.Parallel()

	validation := Validation{CurrentVersion, "validation-1", "candidate-1", ChannelNightly, testSHA, "codex-1", ValidationAccepted, "tester-1", ""}
	encoded, err := json.Marshal(validation)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "role") || strings.Contains(string(encoded), "origin") || strings.Contains(string(encoded), "automated") {
		t.Fatalf("validation leaks authorization claims: %s", encoded)
	}
	spoofed := strings.TrimSuffix(string(encoded), "}") + `,"role":"owner"}`
	if _, err := DecodeValidation([]byte(spoofed)); !errors.Is(err, ErrInvalidDocument) {
		t.Fatalf("spoofed role error = %v", err)
	}
	validation.Channel = ChannelMaster
	if err := validation.Validate(); !errors.Is(err, ErrUnknownChannel) {
		t.Fatalf("master in-app validation error = %v", err)
	}
}

func TestSnapshotsBindToVerifiedActorAndRejectionReason(t *testing.T) {
	t.Parallel()

	primary := primaryTester()
	validation := Validation{CurrentVersion, "validation-1", "candidate-1", ChannelNightly, testSHA, "codex-1", ValidationAccepted, primary.ID(), ""}
	if err := validation.ValidateForActor(primary); err != nil {
		t.Fatalf("verified validation error = %v", err)
	}
	validation.CandidateAuthorID = primary.ID()
	if err := validation.ValidateForActor(primary); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("self validation error = %v", err)
	}
	validation.CandidateAuthorID = "codex-1"
	validation.ActorID = "spoofed-owner"
	if err := validation.ValidateForActor(primary); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("spoofed actor error = %v", err)
	}
	validation.ActorID = primary.ID()
	validation.Decision = ValidationCannotVerify
	if validation.RejectionReason != "" {
		t.Fatalf("cannot_verify with rejection reason should be invalid")
	}
	if err := validation.ValidateForActor(primary); err != nil {
		t.Fatalf("cannot_verify validation error = %v", err)
	}
	validation.Decision = ValidationRejected
	if err := validation.Validate(); !errors.Is(err, ErrInvalidDocument) {
		t.Fatalf("rejection without reason error = %v", err)
	}
	validation.RejectionReason = RejectionIssuePersists
	if err := validation.ValidateForActor(primary); err != nil {
		t.Fatalf("reasoned rejection error = %v", err)
	}

	codex, err := NewAutomatedActor("codex-1", OriginCodex)
	if err != nil {
		t.Fatal(err)
	}
	candidate := CandidateBuild{CurrentVersion, "candidate-1", "issue-1", ChannelNightly, "0.1.0-nightly.1", testSHA, codex.ID(), CandidatePending}
	if err := candidate.ValidateForAuthor(codex); err != nil {
		t.Fatalf("verified candidate author error = %v", err)
	}
	candidate.AuthorID = "another-codex"
	if err := candidate.ValidateForAuthor(codex); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("spoofed candidate author error = %v", err)
	}
}

func TestPromotionSnapshotBindsValidatedSHAAndRoute(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		from     Channel
		to       Channel
		exactSHA string
		validSHA string
		authorID string
		want     error
	}{
		{name: "nightly to testers", from: ChannelNightly, to: ChannelTesters, exactSHA: testSHA, validSHA: testSHA, authorID: "owner-1"},
		{name: "testers to master", from: ChannelTesters, to: ChannelMaster, exactSHA: testSHA, validSHA: testSHA, authorID: "owner-1"},
		{name: "stale validated SHA", from: ChannelNightly, to: ChannelTesters, exactSHA: testSHA, validSHA: "cccccccccccccccccccccccccccccccccccccccc", authorID: "owner-1", want: ErrStaleSHA},
		{name: "invalid route", from: ChannelNightly, to: ChannelMaster, exactSHA: testSHA, validSHA: testSHA, authorID: "owner-1", want: ErrInvalidTransition},
		{name: "authorization missing", from: ChannelNightly, to: ChannelTesters, exactSHA: testSHA, validSHA: testSHA, want: ErrInvalidDocument},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			promotion := Promotion{CurrentVersion, "promotion-1", "candidate-1", test.from, test.to, test.exactSHA, test.validSHA, PromotionAuthorized, test.authorID}
			err := promotion.Validate()
			if !errors.Is(err, test.want) {
				t.Fatalf("Validate() error = %v, want %v", err, test.want)
			}
		})
	}
	owner := mustHumanActor("owner-1", RoleOwner)
	promotion := Promotion{CurrentVersion, "promotion-1", "candidate-1", ChannelNightly, ChannelTesters, testSHA, testSHA, PromotionAuthorized, owner.ID()}
	if err := promotion.ValidateForActor(owner); err != nil {
		t.Fatalf("verified promotion actor error = %v", err)
	}
	promotion.AuthorizedByID = "spoofed"
	if err := promotion.ValidateForActor(owner); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("spoofed promotion actor error = %v", err)
	}
	tester, err := NewHumanActor("tester-1", RoleTester)
	if err != nil {
		t.Fatal(err)
	}
	if err := promotion.ValidateForActor(tester); !errors.Is(err, ErrPermissionDenied) {
		t.Fatalf("promotion actor role error = %v", err)
	}
}

func decodeReport(document []byte) error   { _, err := DecodeReport(document); return err }
func decodeEvidence(document []byte) error { _, err := DecodeEvidence(document); return err }
func decodeTechnicalIssue(document []byte) error {
	_, err := DecodeTechnicalIssue(document)
	return err
}
func decodeCodexRun(document []byte) error   { _, err := DecodeCodexRun(document); return err }
func decodeCandidate(document []byte) error  { _, err := DecodeCandidateBuild(document); return err }
func decodeValidation(document []byte) error { _, err := DecodeValidation(document); return err }
func decodePromotion(document []byte) error  { _, err := DecodePromotion(document); return err }

func primaryTester() Actor {
	actor, err := NewHumanActor("primary-1", RolePrimaryTester)
	if err != nil {
		panic(err)
	}
	return actor
}

func automationActor() Actor {
	actor, err := NewAutomatedActor("orchestrator-1", OriginOrchestrator)
	if err != nil {
		panic(err)
	}
	return actor
}
