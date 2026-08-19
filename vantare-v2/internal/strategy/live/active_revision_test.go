package live

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
)

func TestResolveActiveRevisionRejectsUnavailableOrInvalidActivePlan(t *testing.T) {
	revision := editorRevision(t, "plan-1", "variant-1", "revision-1", validEditorV1Payload())
	active := activeForRevision(t, revision)
	invalidActive := active
	invalidActive.ContractVersion = "strategy.v99"

	tests := []struct {
		name      string
		active    *contract.ActivePlan
		revisions []contract.PlanRevision[json.RawMessage]
		want      error
	}{
		{name: "nil active plan", revisions: []contract.PlanRevision[json.RawMessage]{revision}, want: ErrNoActivePlan},
		{name: "invalid active plan", active: &invalidActive, revisions: []contract.PlanRevision[json.RawMessage]{revision}, want: ErrInvalidActivePlan},
		{name: "revision absent", active: &active, want: ErrActiveRevisionNotFound},
		{name: "duplicate exact revision", active: &active, revisions: []contract.PlanRevision[json.RawMessage]{revision, revision}, want: ErrActiveRevisionMismatch},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			plan, err := ResolveActivePlan(test.active, test.revisions)
			if !errors.Is(err, test.want) {
				t.Fatalf("ResolveActivePlan error = %v, want %v", err, test.want)
			}
			if !reflect.DeepEqual(plan, Plan{}) {
				t.Fatalf("ResolveActivePlan returned partial plan: %+v", plan)
			}
		})
	}
}

func TestResolveActiveRevisionRejectsRevisionIdentityMismatch(t *testing.T) {
	revision := editorRevision(t, "plan-1", "variant-1", "revision-1", validEditorV1Payload())
	tests := []struct {
		name string
		edit func(*contract.RevisionRef)
	}{
		{name: "plan", edit: func(ref *contract.RevisionRef) { ref.PlanID = "plan-2" }},
		{name: "variant", edit: func(ref *contract.RevisionRef) { ref.VariantID = "variant-2" }},
		{name: "hash", edit: func(ref *contract.RevisionRef) { ref.ContentHash = strings.Repeat("b", 64) }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ref := revision.Ref()
			test.edit(&ref)
			active := activeForRef(t, ref)
			plan, err := ResolveActivePlan(&active, []contract.PlanRevision[json.RawMessage]{revision})
			if !errors.Is(err, ErrActiveRevisionMismatch) {
				t.Fatalf("ResolveActivePlan error = %v, want ErrActiveRevisionMismatch", err)
			}
			if !reflect.DeepEqual(plan, Plan{}) {
				t.Fatalf("ResolveActivePlan returned partial plan: %+v", plan)
			}
		})
	}
}

func TestResolveActiveRevisionChecksIdentityBeforeDecodingPayload(t *testing.T) {
	revision := editorRevision(t, "plan-1", "variant-1", "revision-1", []byte(`{"editorVersion":"strategy.editor.v99"}`))
	ref := revision.Ref()
	ref.ContentHash = strings.Repeat("b", 64)
	active := activeForRef(t, ref)

	plan, err := ResolveActivePlan(&active, []contract.PlanRevision[json.RawMessage]{revision})
	if !errors.Is(err, ErrActiveRevisionMismatch) || errors.Is(err, ErrUnsupportedEditorVersion) {
		t.Fatalf("ResolveActivePlan error = %v, want identity mismatch before payload decoding", err)
	}
	if !reflect.DeepEqual(plan, Plan{}) {
		t.Fatalf("ResolveActivePlan returned partial plan: %+v", plan)
	}
}

func TestResolveActiveRevisionRejectsIncompatibleEditorPayload(t *testing.T) {
	tests := []struct {
		name    string
		payload []byte
		want    error
	}{
		{name: "unknown version", payload: []byte(`{"editorVersion":"strategy.editor.v2"}`), want: ErrUnsupportedEditorVersion},
		{name: "invalid v1", payload: editorV1PayloadWithStints(`{"id":"same","lapCount":1,"fuelLitres":0,"pace":"-","assignments":{"front_left":null,"front_right":null,"rear_left":null,"rear_right":null}},{"id":"same","lapCount":1,"fuelLitres":0,"pace":"-","assignments":{"front_left":null,"front_right":null,"rear_left":null,"rear_right":null}}`), want: ErrInvalidEditorDocument},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			revision := editorRevision(t, "plan-1", "variant-1", "revision-1", test.payload)
			active := activeForRevision(t, revision)
			plan, err := ResolveActivePlan(&active, []contract.PlanRevision[json.RawMessage]{revision})
			if !errors.Is(err, test.want) {
				t.Fatalf("ResolveActivePlan error = %v, want %v", err, test.want)
			}
			if !reflect.DeepEqual(plan, Plan{}) {
				t.Fatalf("ResolveActivePlan returned partial plan: %+v", plan)
			}
		})
	}
}

func TestResolveActiveRevisionMapsExactEditorV1WithoutFuelTargetsOrAliases(t *testing.T) {
	revision := editorRevision(t, "plan-1", "variant-1", "revision-1", validEditorV1Payload())
	active := activeForRevision(t, revision)
	previous := active.Revision
	previous.RevisionID = "revision-previous"
	previous.ContentHash = strings.Repeat("c", 64)
	active.PreviousRevision = &previous

	plan, err := ResolveActivePlan(&active, []contract.PlanRevision[json.RawMessage]{revision})
	if err != nil {
		t.Fatal(err)
	}
	wantStints := []Stint{{ID: "opening", Laps: 17}, {ID: "finish", Laps: 22}}
	if got := plan.Stints(); !reflect.DeepEqual(got, wantStints) {
		t.Fatalf("stints = %+v, want %+v", got, wantStints)
	}
	if plan.FuelTargets() != nil {
		t.Fatalf("FuelTargets = %+v, want nil", plan.FuelTargets())
	}
	if got := plan.ActivePlan(); !reflect.DeepEqual(got, active) {
		t.Fatalf("active plan = %+v, want %+v", got, active)
	}

	active.PreviousRevision.RevisionID = "mutated-input"
	got := plan.ActivePlan()
	if got.PreviousRevision == nil || got.PreviousRevision.RevisionID != "revision-previous" {
		t.Fatalf("active plan retained input alias: %+v", got.PreviousRevision)
	}
	returned := plan.Stints()
	returned[0].ID = "mutated-output"
	if plan.Stints()[0].ID != "opening" {
		t.Fatal("resolved plan exposed stint alias")
	}
}

func TestDecodeEditorV1RejectsMalformedOrDriftedJSON(t *testing.T) {
	tests := []struct {
		name    string
		payload string
		want    error
	}{
		{name: "corrupt", payload: `{`, want: ErrInvalidEditorDocument},
		{name: "trailing", payload: string(validEditorV1Payload()) + `{}`, want: ErrInvalidEditorDocument},
		{name: "duplicate top-level field", payload: `{"editorVersion":"strategy.editor.v1","editorVersion":"strategy.editor.v1","nextStintNumber":2,"stints":[],"tyres":[],"manualInputs":{}}`, want: ErrInvalidEditorDocument},
		{name: "unknown top-level field", payload: `{"editorVersion":"strategy.editor.v1","nextStintNumber":2,"stints":[],"tyres":[],"manualInputs":{},"future":true}`, want: ErrInvalidEditorDocument},
		{name: "unknown editor version takes precedence", payload: `{"editorVersion":"strategy.editor.v2"}`, want: ErrUnsupportedEditorVersion},
		{name: "missing editor version", payload: `{"nextStintNumber":2,"stints":[],"tyres":[],"manualInputs":{}}`, want: ErrInvalidEditorDocument},
		{name: "wrong editor version type", payload: `{"editorVersion":1,"nextStintNumber":2,"stints":[],"tyres":[],"manualInputs":{}}`, want: ErrInvalidEditorDocument},
		{name: "missing tyres", payload: `{"editorVersion":"strategy.editor.v1","nextStintNumber":2,"stints":[],"manualInputs":{}}`, want: ErrInvalidEditorDocument},
		{name: "wrong tyres shape", payload: `{"editorVersion":"strategy.editor.v1","nextStintNumber":2,"stints":[],"tyres":{},"manualInputs":{}}`, want: ErrInvalidEditorDocument},
		{name: "wrong tyre item shape", payload: `{"editorVersion":"strategy.editor.v1","nextStintNumber":2,"stints":[],"tyres":[1],"manualInputs":{}}`, want: ErrInvalidEditorDocument},
		{name: "duplicate field in unconsumed branch", payload: `{"editorVersion":"strategy.editor.v1","nextStintNumber":2,"stints":[],"tyres":[{"id":"one","id":"two"}],"manualInputs":{}}`, want: ErrInvalidEditorDocument},
		{name: "missing manual inputs", payload: `{"editorVersion":"strategy.editor.v1","nextStintNumber":2,"stints":[],"tyres":[]}`, want: ErrInvalidEditorDocument},
		{name: "wrong manual inputs shape", payload: `{"editorVersion":"strategy.editor.v1","nextStintNumber":2,"stints":[],"tyres":[],"manualInputs":[]}`, want: ErrInvalidEditorDocument},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			stints, err := decodeEditorV1([]byte(test.payload))
			if !errors.Is(err, test.want) {
				t.Fatalf("decodeEditorV1 error = %v, want %v", err, test.want)
			}
			if stints != nil {
				t.Fatalf("decodeEditorV1 returned partial stints: %+v", stints)
			}
		})
	}
}

func TestDecodeEditorV1ValidatesUnconsumedBranchShapeWithoutInterpretingIt(t *testing.T) {
	stint := `{"id":"one","lapCount":1,"fuelLitres":0,"pace":"-","assignments":{"front_left":null,"front_right":null,"rear_left":null,"rear_right":null}}`
	payload := func(tyres, manualInputs string) []byte {
		return []byte(`{"editorVersion":"strategy.editor.v1","nextStintNumber":2,"stints":[` + stint + `],"tyres":` + tyres + `,"manualInputs":` + manualInputs + `}`)
	}
	tests := []struct {
		name         string
		tyres        string
		manualInputs string
		wantErr      bool
	}{
		{name: "tyres must be array", tyres: `{}`, manualInputs: `{}`, wantErr: true},
		{name: "tyre entries must be objects", tyres: `[1]`, manualInputs: `{}`, wantErr: true},
		{name: "manual inputs must be object", tyres: `[]`, manualInputs: `[]`, wantErr: true},
		{name: "unconsumed object contents remain opaque", tyres: `[{"future":true}]`, manualInputs: `{"future":{"nested":true}}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			stints, err := decodeEditorV1(payload(test.tyres, test.manualInputs))
			if errors.Is(err, ErrInvalidEditorDocument) != test.wantErr {
				t.Fatalf("decodeEditorV1 error = %v, want invalid=%t", err, test.wantErr)
			}
			if !test.wantErr && !reflect.DeepEqual(stints, []Stint{{ID: "one", Laps: 1}}) {
				t.Fatalf("stints = %+v, want opaque branches ignored", stints)
			}
		})
	}
}

func TestDecodeEditorV1RejectsIncompleteOrInvalidStints(t *testing.T) {
	validAssignments := `"assignments":{"front_left":null,"front_right":null,"rear_left":null,"rear_right":null}`
	validRest := `"fuelLitres":10,"pace":"1:23.4",` + validAssignments
	tests := []struct {
		name  string
		stint string
	}{
		{name: "missing id", stint: `{` + `"lapCount":1,` + validRest + `}`},
		{name: "wrong id", stint: `{"id":1,"lapCount":1,` + validRest + `}`},
		{name: "unsafe id", stint: `{"id":"bad id","lapCount":1,` + validRest + `}`},
		{name: "missing laps", stint: `{"id":"one",` + validRest + `}`},
		{name: "wrong laps", stint: `{"id":"one","lapCount":"1",` + validRest + `}`},
		{name: "fractional laps", stint: `{"id":"one","lapCount":1.5,` + validRest + `}`},
		{name: "zero laps", stint: `{"id":"one","lapCount":0,` + validRest + `}`},
		{name: "negative laps", stint: `{"id":"one","lapCount":-1,` + validRest + `}`},
		{name: "unsafe laps", stint: `{"id":"one","lapCount":9007199254740992,` + validRest + `}`},
		{name: "missing fuel", stint: `{"id":"one","lapCount":1,"pace":"1:23.4",` + validAssignments + `}`},
		{name: "wrong fuel", stint: `{"id":"one","lapCount":1,"fuelLitres":"10","pace":"1:23.4",` + validAssignments + `}`},
		{name: "negative fuel", stint: `{"id":"one","lapCount":1,"fuelLitres":-1,"pace":"1:23.4",` + validAssignments + `}`},
		{name: "missing pace", stint: `{"id":"one","lapCount":1,"fuelLitres":10,` + validAssignments + `}`},
		{name: "wrong pace", stint: `{"id":"one","lapCount":1,"fuelLitres":10,"pace":1,` + validAssignments + `}`},
		{name: "long pace", stint: `{"id":"one","lapCount":1,"fuelLitres":10,"pace":"` + strings.Repeat("x", 33) + `",` + validAssignments + `}`},
		{name: "missing assignments", stint: `{"id":"one","lapCount":1,"fuelLitres":10,"pace":"1:23.4"}`},
		{name: "missing assignment corner", stint: `{"id":"one","lapCount":1,"fuelLitres":10,"pace":"1:23.4","assignments":{"front_left":null,"front_right":null,"rear_left":null}}`},
		{name: "wrong assignment", stint: `{"id":"one","lapCount":1,"fuelLitres":10,"pace":"1:23.4","assignments":{"front_left":1,"front_right":null,"rear_left":null,"rear_right":null}}`},
		{name: "unknown assignment", stint: `{"id":"one","lapCount":1,"fuelLitres":10,"pace":"1:23.4","assignments":{"front_left":null,"front_right":null,"rear_left":null,"rear_right":null,"spare":null}}`},
		{name: "unknown stint field", stint: `{"id":"one","lapCount":1,` + validRest + `,"future":true}`},
		{name: "duplicate stint field", stint: `{"id":"one","id":"two","lapCount":1,` + validRest + `}`},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload := editorV1PayloadWithStints(test.stint)
			stints, err := decodeEditorV1(payload)
			if !errors.Is(err, ErrInvalidEditorDocument) {
				t.Fatalf("decodeEditorV1 error = %v, want ErrInvalidEditorDocument", err)
			}
			if stints != nil {
				t.Fatalf("decodeEditorV1 returned partial stints: %+v", stints)
			}
		})
	}
}

func TestDecodeEditorV1RejectsDuplicateIDsUnsafeTotalsAndTooManyStints(t *testing.T) {
	stint := func(id string, laps string) string {
		return fmt.Sprintf(`{"id":%q,"lapCount":%s,"fuelLitres":0,"pace":"-","assignments":{"front_left":null,"front_right":null,"rear_left":null,"rear_right":null}}`, id, laps)
	}
	many := make([]string, 129)
	for index := range many {
		many[index] = stint(fmt.Sprintf("stint-%d", index), "1")
	}
	tests := []struct {
		name   string
		stints string
	}{
		{name: "duplicate ids", stints: stint("same", "1") + "," + stint("same", "1")},
		{name: "unsafe total", stints: stint("one", "9007199254740991") + "," + stint("two", "1")},
		{name: "too many stints", stints: strings.Join(many, ",")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			stints, err := decodeEditorV1(editorV1PayloadWithStints(test.stints))
			if !errors.Is(err, ErrInvalidEditorDocument) {
				t.Fatalf("decodeEditorV1 error = %v, want ErrInvalidEditorDocument", err)
			}
			if stints != nil {
				t.Fatalf("decodeEditorV1 returned partial stints: %+v", stints)
			}
		})
	}
}

func TestDecodeEditorV1RejectsFractionalSafeIntegersThatFloat64Rounds(t *testing.T) {
	validStint := func(lapCount string) string {
		return `{"id":"one","lapCount":` + lapCount + `,"fuelLitres":0,"pace":"-","assignments":{"front_left":null,"front_right":null,"rear_left":null,"rear_right":null}}`
	}
	lexemes := []string{
		"9007199254740991.1",
		"9.0071992547409911e15",
		"9007199254740990.9",
	}
	for _, field := range []string{"nextStintNumber", "lapCount"} {
		for _, lexeme := range lexemes {
			t.Run(field+"/"+lexeme, func(t *testing.T) {
				payload := editorV1PayloadWithStints(validStint("1"))
				if field == "nextStintNumber" {
					payload = []byte(strings.Replace(string(payload), `"nextStintNumber":2`, `"nextStintNumber":`+lexeme, 1))
				} else {
					payload = editorV1PayloadWithStints(validStint(lexeme))
				}

				stints, err := decodeEditorV1(payload)
				if !errors.Is(err, ErrInvalidEditorDocument) {
					t.Fatalf("decodeEditorV1 error = %v, want ErrInvalidEditorDocument", err)
				}
				if stints != nil {
					t.Fatalf("decodeEditorV1 returned partial stints: %+v", stints)
				}
			})
		}
	}
}

func TestDecodeEditorV1AcceptsExactIntegerLexemesAndFractionalFuel(t *testing.T) {
	payload := []byte(`{"editorVersion":"strategy.editor.v1","nextStintNumber":2e0,"stints":[{"id":"one","lapCount":1.0,"fuelLitres":0.5,"pace":"-","assignments":{"front_left":null,"front_right":null,"rear_left":null,"rear_right":null}}],"tyres":[],"manualInputs":{}}`)

	stints, err := decodeEditorV1(payload)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(stints, []Stint{{ID: "one", Laps: 1}}) {
		t.Fatalf("stints = %+v, want exact integer lexemes accepted", stints)
	}
}

func TestActiveRevisionRestartProducesTheSamePlan(t *testing.T) {
	root := t.TempDir()
	revision := editorRevision(t, "plan-1", "variant-1", "revision-1", validEditorV1Payload())
	active := activeForRevision(t, revision)

	firstRepository, err := repository.Open[json.RawMessage](root, repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	committed, err := firstRepository.Commit(context.Background(), 0, repository.ChangeSet[json.RawMessage]{
		Revisions: []contract.PlanRevision[json.RawMessage]{revision},
		Activate:  &active,
	})
	if err != nil {
		t.Fatal(err)
	}
	firstPlan, err := ResolveActivePlan(committed.ActivePlan, committed.Revisions)
	if err != nil {
		t.Fatal(err)
	}

	reopened, err := repository.Open[json.RawMessage](root, repository.Options{})
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := reopened.Snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	secondPlan, err := ResolveActivePlan(snapshot.ActivePlan, snapshot.Revisions)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(firstPlan.ActivePlan(), secondPlan.ActivePlan()) ||
		!reflect.DeepEqual(firstPlan.Stints(), secondPlan.Stints()) ||
		!reflect.DeepEqual(firstPlan.FuelTargets(), secondPlan.FuelTargets()) {
		t.Fatalf("restart changed plan:\nfirst:  %+v %+v %+v\nsecond: %+v %+v %+v",
			firstPlan.ActivePlan(), firstPlan.Stints(), firstPlan.FuelTargets(),
			secondPlan.ActivePlan(), secondPlan.Stints(), secondPlan.FuelTargets())
	}
}

func editorRevision(
	t testing.TB,
	planID contract.PlanID,
	variantID contract.VariantID,
	revisionID contract.RevisionID,
	payload []byte,
) contract.PlanRevision[json.RawMessage] {
	t.Helper()
	draft := contract.PlanDraft[json.RawMessage]{
		ContractVersion: contract.CurrentVersion,
		DraftID:         contract.DraftID("draft-" + revisionID),
		PlanID:          planID,
		VariantID:       variantID,
		Name:            "Race plan",
		Mode:            contract.PlanModeManual,
		Capabilities:    []contract.Capability{contract.CapabilityManualInputs},
		Provenance:      contract.Provenance{Kind: contract.ProvenanceManual, SourceID: "strategy-editor"},
		Confidence:      contract.Confidence{Level: contract.ConfidenceHigh, Basis: "saved editor revision"},
		UpdatedAt:       time.Date(2026, 8, 14, 8, 0, 0, 0, time.UTC),
		Payload:         append(json.RawMessage(nil), payload...),
	}
	revision, err := contract.NewPlanRevision(draft, contract.RevisionMetadata{
		RevisionID: revisionID,
		CreatedAt:  time.Date(2026, 8, 14, 8, 1, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("NewPlanRevision: %v", err)
	}
	return revision
}

func activeForRevision(t testing.TB, revision contract.PlanRevision[json.RawMessage]) contract.ActivePlan {
	t.Helper()
	return activeForRef(t, revision.Ref())
}

func activeForRef(t testing.TB, ref contract.RevisionRef) contract.ActivePlan {
	t.Helper()
	active, err := contract.NewActivePlan(
		"activation-isa-340",
		ref,
		time.Date(2026, 8, 14, 8, 2, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("NewActivePlan: %v", err)
	}
	return active
}

func validEditorV1Payload() []byte {
	return []byte(`{
		"editorVersion":"strategy.editor.v1",
		"nextStintNumber":3,
		"stints":[
			{"id":"opening","lapCount":17,"fuelLitres":82,"pace":"2:18.4","assignments":{"front_left":"M-01","front_right":null,"rear_left":null,"rear_right":null}},
			{"id":"finish","lapCount":22,"fuelLitres":96,"pace":"2:19.1","assignments":{"front_left":null,"front_right":null,"rear_left":null,"rear_right":null}}
		],
		"tyres":[{"id":"M-01","futureShapeIsIgnored":true}],
		"manualInputs":{"version":"strategy.manual.v1","fuelPerLapLitres":4.8}
	}`)
}

func editorV1PayloadWithStints(stints string) []byte {
	return []byte(`{"editorVersion":"strategy.editor.v1","nextStintNumber":2,"stints":[` + stints + `],"tyres":[],"manualInputs":{}}`)
}
