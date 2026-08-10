package packaging

import (
	"bytes"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

type testPayload struct {
	Laps int `json:"laps"`
}

func canonicalTime(second int) time.Time {
	return time.Date(2026, 8, 2, 0, 0, second, 0, time.UTC)
}

func provenance() Provenance {
	return Provenance{
		Application:        "vantare",
		ApplicationVersion: "0.1.0.7",
		ExportedAt:         canonicalTime(30),
	}
}

func draft(draftID contract.DraftID, planID contract.PlanID, laps int) contract.PlanDraft[testPayload] {
	return contract.PlanDraft[testPayload]{
		ContractVersion: contract.CurrentVersion,
		DraftID:         draftID,
		PlanID:          planID,
		VariantID:       "variant-1",
		Name:            "Race plan",
		Mode:            contract.PlanModeManual,
		Capabilities:    []contract.Capability{contract.CapabilityManualInputs},
		Provenance:      contract.Provenance{Kind: contract.ProvenanceManual, SourceID: "user"},
		Confidence:      contract.Confidence{Level: contract.ConfidenceHigh, Basis: "manual input"},
		UpdatedAt:       canonicalTime(1),
		Payload:         testPayload{Laps: laps},
	}
}

func revision(t *testing.T, source contract.PlanDraft[testPayload], id contract.RevisionID, at int) contract.PlanRevision[testPayload] {
	t.Helper()
	made, err := contract.NewPlanRevision(source, contract.RevisionMetadata{RevisionID: id, CreatedAt: canonicalTime(at)})
	if err != nil {
		t.Fatalf("NewPlanRevision: %v", err)
	}
	return made
}

func onePlan(t *testing.T) []Bundle[testPayload] {
	t.Helper()
	base := draft("draft-1", "plan-1", 10)
	return []Bundle[testPayload]{{
		PlanID:    "plan-1",
		VariantID: "variant-1",
		Draft:     &base,
		Revisions: []contract.PlanRevision[testPayload]{revision(t, base, "revision-1", 5)},
	}}
}

func buildOne(t *testing.T) Package[testPayload] {
	t.Helper()
	built, err := Build(provenance(), onePlan(t))
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	return built
}

func TestAPackageSurvivesARoundTripUnchanged(t *testing.T) {
	built := buildOne(t)
	encoded, err := Encode(built)
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	decoded, err := Decode[testPayload](encoded)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	if decoded.Checksum != built.Checksum {
		t.Fatalf("checksum changed across the round trip: %q vs %q", decoded.Checksum, built.Checksum)
	}
	if len(decoded.Bundles) != 1 || decoded.Bundles[0].Draft == nil {
		t.Fatalf("round trip lost documents: %+v", decoded.Bundles)
	}
	if decoded.Bundles[0].Draft.Payload.Laps != 10 {
		t.Fatalf("payload changed: %+v", decoded.Bundles[0].Draft.Payload)
	}
	if decoded.Bundles[0].Revisions[0].ContentHash() != built.Bundles[0].Revisions[0].ContentHash() {
		t.Fatal("a revision must keep its content hash through a package")
	}
	if decoded.Provenance != built.Provenance {
		t.Fatalf("provenance changed: %+v", decoded.Provenance)
	}
}

func TestExportingTheSamePlansTwiceProducesIdenticalBytes(t *testing.T) {
	first, err := Encode(buildOne(t))
	if err != nil {
		t.Fatal(err)
	}
	second, err := Encode(buildOne(t))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("a package must be a deterministic function of its content")
	}
}

func TestBundleOrderDoesNotChangeTheChecksum(t *testing.T) {
	first := draft("draft-1", "plan-a", 10)
	second := draft("draft-2", "plan-b", 20)
	forward, err := Build(provenance(), []Bundle[testPayload]{
		{PlanID: "plan-a", VariantID: "variant-1", Draft: &first},
		{PlanID: "plan-b", VariantID: "variant-1", Draft: &second},
	})
	if err != nil {
		t.Fatal(err)
	}
	backward, err := Build(provenance(), []Bundle[testPayload]{
		{PlanID: "plan-b", VariantID: "variant-1", Draft: &second},
		{PlanID: "plan-a", VariantID: "variant-1", Draft: &first},
	})
	if err != nil {
		t.Fatal(err)
	}
	if forward.Checksum != backward.Checksum {
		t.Fatal("the same plans in a different order are the same package")
	}
}

func TestATamperedPayloadIsRefused(t *testing.T) {
	encoded, err := Encode(buildOne(t))
	if err != nil {
		t.Fatal(err)
	}
	tampered := bytes.Replace(encoded, []byte(`"laps": 10`), []byte(`"laps": 99`), 1)
	if bytes.Equal(tampered, encoded) {
		t.Fatal("the test failed to alter the package")
	}
	if _, err := Decode[testPayload](tampered); !HasErrorCode(err, ErrorChecksumMismatch) {
		t.Fatalf("expected a checksum mismatch, got %v", err)
	}
}

func TestATamperedRevisionIsRefusedEvenWithARepairedChecksum(t *testing.T) {
	// The strongest case: an attacker edits a revision and recomputes the
	// package checksum so it agrees. The revision's own content hash must
	// still catch it.
	built := buildOne(t)
	encoded, err := Encode(built)
	if err != nil {
		t.Fatal(err)
	}
	var wire wirePackage
	if err := json.Unmarshal(encoded, &wire); err != nil {
		t.Fatal(err)
	}
	compacted := bytes.NewBuffer(nil)
	if err := json.Compact(compacted, wire.Bundles[0].Revisions[0]); err != nil {
		t.Fatal(err)
	}
	wire.Bundles[0].Revisions[0] = json.RawMessage(bytes.Replace(
		compacted.Bytes(), []byte(`"laps":10`), []byte(`"laps":99`), 1))
	if !bytes.Contains(wire.Bundles[0].Revisions[0], []byte(`"laps":99`)) {
		t.Fatal("the test failed to alter the revision")
	}
	repaired, err := checksumOf(wire)
	if err != nil {
		t.Fatal(err)
	}
	wire.Checksum = repaired
	forged, err := json.Marshal(wire)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Decode[testPayload](forged); !contract.HasErrorCode(err, contract.ErrorHashMismatch) {
		t.Fatalf("a revision must be verified by its own hash, got %v", err)
	}
}

func TestAPackageFromAnotherEnvelopeVersionIsRefused(t *testing.T) {
	encoded, err := Encode(buildOne(t))
	if err != nil {
		t.Fatal(err)
	}
	future := bytes.Replace(encoded, []byte(PackageVersionV1), []byte("strategy.package.v2"), 1)
	if _, err := Decode[testPayload](future); !HasErrorCode(err, ErrorUnsupportedPackageVersion) {
		t.Fatalf("a future package version must fail closed, got %v", err)
	}
}

func TestAPackageWithIncompleteProvenanceIsRefused(t *testing.T) {
	// Provenance is the only evidence the importer has about where a package
	// came from, so every part of it is mandatory.
	for name, incomplete := range map[string]Provenance{
		"no application": {ApplicationVersion: "1", ExportedAt: canonicalTime(3)},
		"no version":     {Application: "vantare", ExportedAt: canonicalTime(3)},
		"no export time": {Application: "vantare", ApplicationVersion: "1"},
		"nothing":        {},
	} {
		if _, err := Build(incomplete, onePlan(t)); !HasErrorCode(err, ErrorInvalidProvenance) {
			t.Fatalf("%s: expected a provenance refusal, got %v", name, err)
		}
	}
}

func TestAnEmptyPackageIsRefused(t *testing.T) {
	if _, err := Build[testPayload](provenance(), nil); !HasErrorCode(err, ErrorEmptyPackage) {
		t.Fatalf("expected an empty-package refusal, got %v", err)
	}
	if _, err := Decode[testPayload](nil); !HasErrorCode(err, ErrorInvalidPackage) {
		t.Fatalf("expected an invalid-package refusal, got %v", err)
	}
}

func TestAPlanWithNeitherDraftNorRevisionsIsRefused(t *testing.T) {
	_, err := Build(provenance(), []Bundle[testPayload]{{PlanID: "plan-1", VariantID: "variant-1"}})
	if !HasErrorCode(err, ErrorEmptyBundle) {
		t.Fatalf("expected an empty-bundle refusal, got %v", err)
	}
}

func TestADocumentFiledUnderTheWrongPlanIsRefused(t *testing.T) {
	stray := draft("draft-1", "plan-other", 10)
	_, err := Build(provenance(), []Bundle[testPayload]{{PlanID: "plan-1", VariantID: "variant-1", Draft: &stray}})
	if !HasErrorCode(err, ErrorMisplacedDocument) {
		t.Fatalf("a draft must belong to the plan that carries it, got %v", err)
	}
}

func TestUnknownFieldsAreRefusedRatherThanIgnored(t *testing.T) {
	encoded, err := Encode(buildOne(t))
	if err != nil {
		t.Fatal(err)
	}
	extended := bytes.Replace(encoded, []byte(`"packageVersion"`), []byte(`"surprise": true,
  "packageVersion"`), 1)
	if _, err := Decode[testPayload](extended); !HasErrorCode(err, ErrorInvalidPackage) {
		t.Fatalf("an unrecognised field must be refused, not dropped, got %v", err)
	}
}

func TestTrailingDataIsRefused(t *testing.T) {
	encoded, err := Encode(buildOne(t))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Decode[testPayload](append(encoded, []byte("{}")...)); !HasErrorCode(err, ErrorInvalidPackage) {
		t.Fatalf("expected trailing data to be refused, got %v", err)
	}
}

func TestAnOversizePackageIsRefusedBeforeItIsParsed(t *testing.T) {
	oversize := make([]byte, MaxPackageBytes+1)
	if _, err := Decode[testPayload](oversize); !HasErrorCode(err, ErrorInvalidPackage) {
		t.Fatalf("expected a size refusal, got %v", err)
	}
}

func TestTheSamePlanTwiceInOnePackageIsRefused(t *testing.T) {
	encoded, err := Encode(buildOne(t))
	if err != nil {
		t.Fatal(err)
	}
	var wire wirePackage
	if err := json.Unmarshal(encoded, &wire); err != nil {
		t.Fatal(err)
	}
	wire.Bundles = append(wire.Bundles, wire.Bundles[0])
	wire.Checksum = ""
	checksum, err := checksumOf(wire)
	if err != nil {
		t.Fatal(err)
	}
	wire.Checksum = checksum
	duplicated, err := json.Marshal(wire)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Decode[testPayload](duplicated); !HasErrorCode(err, ErrorDuplicateDocument) {
		t.Fatalf("expected a duplicate refusal, got %v", err)
	}
}

func TestEveryRefusalIsIdentifiableAsARejection(t *testing.T) {
	// A caller must be able to tell "this package was refused" from "the disk
	// failed" without reading messages.
	_, err := Build(Provenance{}, onePlan(t))
	if !errors.Is(err, ErrRejected) {
		t.Fatalf("a refusal must wrap ErrRejected, got %v", err)
	}
	if _, err := Decode[testPayload]([]byte("not json")); !errors.Is(err, ErrRejected) {
		t.Fatalf("a refusal must wrap ErrRejected, got %v", err)
	}
}
