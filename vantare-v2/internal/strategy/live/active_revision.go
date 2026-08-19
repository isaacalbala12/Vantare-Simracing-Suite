package live

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/big"
	"unicode/utf16"

	"github.com/vantare/overlays/v2/internal/strategy/contract"
)

const editorVersionV1 = "strategy.editor.v1"

// ResolveActivePlan resolves the immutable revision named by active and
// normalizes only the editor fields that the live engine owns.
func ResolveActivePlan(
	active *contract.ActivePlan,
	revisions []contract.PlanRevision[json.RawMessage],
) (Plan, error) {
	if active == nil {
		return Plan{}, invalid(ErrNoActivePlan, "activePlan", nil)
	}
	if err := active.Validate(); err != nil {
		return Plan{}, invalid(ErrInvalidActivePlan, "activePlan", err)
	}

	var matched *contract.PlanRevision[json.RawMessage]
	for index := range revisions {
		ref := revisions[index].Ref()
		if ref.RevisionID != active.Revision.RevisionID {
			continue
		}
		if ref != active.Revision || matched != nil {
			return Plan{}, invalid(ErrActiveRevisionMismatch, "activePlan.revision", nil)
		}
		matched = &revisions[index]
	}
	if matched == nil {
		return Plan{}, invalid(ErrActiveRevisionNotFound, "activePlan.revision", nil)
	}

	payload, err := matched.Payload()
	if err != nil {
		return Plan{}, invalid(ErrInvalidEditorDocument, "payload", err)
	}
	stints, err := decodeEditorV1(payload)
	if err != nil {
		return Plan{}, err
	}
	plan, err := NewPlan(PlanInput{
		ActivePlan:  *active,
		Stints:      stints,
		FuelTargets: nil,
	})
	if err != nil {
		return Plan{}, invalid(ErrInvalidEditorDocument, "payload.stints", err)
	}
	return plan, nil
}

type editorVersionDeclaration struct {
	EditorVersion json.RawMessage `json:"editorVersion"`
}

type editorV1Document struct {
	EditorVersion   string          `json:"editorVersion"`
	NextStintNumber json.RawMessage `json:"nextStintNumber"`
	Stints          []editorV1Stint `json:"stints"`
	Tyres           json.RawMessage `json:"tyres"`
	ManualInputs    json.RawMessage `json:"manualInputs"`
}

type editorV1Stint struct {
	ID          *string            `json:"id"`
	LapCount    json.RawMessage    `json:"lapCount"`
	FuelLitres  json.RawMessage    `json:"fuelLitres"`
	Pace        *string            `json:"pace"`
	Assignments *editorAssignments `json:"assignments"`
}

type editorAssignments struct {
	FrontLeft  json.RawMessage `json:"front_left"`
	FrontRight json.RawMessage `json:"front_right"`
	RearLeft   json.RawMessage `json:"rear_left"`
	RearRight  json.RawMessage `json:"rear_right"`
}

func decodeEditorV1(payload []byte) ([]Stint, error) {
	if _, _, err := contract.CanonicalizeAndHashJSONV1(payload); err != nil {
		return nil, invalid(ErrInvalidEditorDocument, "payload", err)
	}

	var declaration editorVersionDeclaration
	if err := json.Unmarshal(payload, &declaration); err != nil || len(declaration.EditorVersion) == 0 {
		return nil, invalid(ErrInvalidEditorDocument, "payload.editorVersion", err)
	}
	var version string
	if err := json.Unmarshal(declaration.EditorVersion, &version); err != nil {
		return nil, invalid(ErrInvalidEditorDocument, "payload.editorVersion", err)
	}
	if version != editorVersionV1 {
		return nil, invalid(ErrUnsupportedEditorVersion, "payload.editorVersion", nil)
	}

	var document editorV1Document
	if err := decodeStrictEditorJSON(payload, &document); err != nil {
		return nil, invalid(ErrInvalidEditorDocument, "payload", err)
	}
	if document.EditorVersion != editorVersionV1 {
		return nil, invalid(ErrUnsupportedEditorVersion, "payload.editorVersion", nil)
	}
	if !positiveSafeInteger(document.NextStintNumber) {
		return nil, invalid(ErrInvalidEditorDocument, "payload.nextStintNumber", nil)
	}
	if len(document.Stints) == 0 || len(document.Stints) > maxStints {
		return nil, invalid(ErrInvalidEditorDocument, "payload.stints", nil)
	}
	if err := validateObjectArray(document.Tyres); err != nil {
		return nil, invalid(ErrInvalidEditorDocument, "payload.tyres", err)
	}
	if err := validateObject(document.ManualInputs); err != nil {
		return nil, invalid(ErrInvalidEditorDocument, "payload.manualInputs", err)
	}

	stints := make([]Stint, 0, len(document.Stints))
	seen := make(map[string]struct{}, len(document.Stints))
	var total contract.LapCount
	for index, input := range document.Stints {
		field := fmt.Sprintf("payload.stints[%d]", index)
		if input.ID == nil || !safeID.MatchString(*input.ID) {
			return nil, invalid(ErrInvalidEditorDocument, field+".id", nil)
		}
		if _, duplicate := seen[*input.ID]; duplicate {
			return nil, invalid(ErrInvalidEditorDocument, field+".id", nil)
		}
		seen[*input.ID] = struct{}{}

		laps, ok := safeInteger(input.LapCount)
		if !ok || laps <= 0 || contract.LapCount(laps) > maxSafeInteger-total {
			return nil, invalid(ErrInvalidEditorDocument, field+".lapCount", nil)
		}
		fuel, ok := finiteNumber(input.FuelLitres)
		if !ok || fuel < 0 {
			return nil, invalid(ErrInvalidEditorDocument, field+".fuelLitres", nil)
		}
		if input.Pace == nil || len(utf16.Encode([]rune(*input.Pace))) > 32 {
			return nil, invalid(ErrInvalidEditorDocument, field+".pace", nil)
		}
		if input.Assignments == nil {
			return nil, invalid(ErrInvalidEditorDocument, field+".assignments", nil)
		}
		assignments := []json.RawMessage{
			input.Assignments.FrontLeft,
			input.Assignments.FrontRight,
			input.Assignments.RearLeft,
			input.Assignments.RearRight,
		}
		for _, assignment := range assignments {
			if !nullableString(assignment) {
				return nil, invalid(ErrInvalidEditorDocument, field+".assignments", nil)
			}
		}

		lapsCount := contract.LapCount(laps)
		total += lapsCount
		stints = append(stints, Stint{ID: *input.ID, Laps: lapsCount})
	}
	return stints, nil
}

func decodeStrictEditorJSON(payload []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return fmt.Errorf("JSON contains trailing data")
		}
		return err
	}
	return nil
}

func positiveSafeInteger(raw json.RawMessage) bool {
	value, ok := safeInteger(raw)
	return ok && value > 0
}

func safeInteger(raw json.RawMessage) (int64, bool) {
	if len(raw) == 0 {
		return 0, false
	}
	// The canonical parser has already bounded the whole payload to 4 MiB and
	// proved this is a JSON number. Parse its lexeme exactly so float64 rounding
	// cannot turn a fractional lap count into an integer.
	var exact big.Rat
	if _, ok := exact.SetString(string(raw)); !ok || !exact.IsInt() {
		return 0, false
	}
	integer := exact.Num()
	if !integer.IsInt64() {
		return 0, false
	}
	value := integer.Int64()
	if value < -int64(maxSafeInteger) || value > int64(maxSafeInteger) {
		return 0, false
	}
	return value, true
}

func finiteNumber(raw json.RawMessage) (float64, bool) {
	if len(raw) == 0 {
		return 0, false
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var decoded any
	if err := decoder.Decode(&decoded); err != nil {
		return 0, false
	}
	number, ok := decoded.(json.Number)
	if !ok {
		return 0, false
	}
	value, err := number.Float64()
	return value, err == nil && !math.IsNaN(value) && !math.IsInf(value, 0)
}

func nullableString(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return false
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return true
	}
	var value string
	return json.Unmarshal(raw, &value) == nil
}

func validateObjectArray(raw json.RawMessage) error {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return fmt.Errorf("array is required")
	}
	var values []json.RawMessage
	if err := json.Unmarshal(raw, &values); err != nil {
		return err
	}
	for _, value := range values {
		if err := validateObject(value); err != nil {
			return err
		}
	}
	return nil
}

func validateObject(raw json.RawMessage) error {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return fmt.Errorf("object is required")
	}
	var value map[string]json.RawMessage
	if err := json.Unmarshal(raw, &value); err != nil {
		return err
	}
	if value == nil {
		return fmt.Errorf("object is required")
	}
	return nil
}
