package telemetryanalysis

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

// T12j2 — snapshot canónico v4. Vectores v3 fijados desde la baseline previa
// (log isa1104-t12j2-baseline-r1.log); no regenerarlos tras el cambio.
// Son fixtures, no datos empíricos.
const (
	identityBaselineClassesSnapshot = "9d116311eca44f2e75443b267e8979cc55b39fa41756c92ae32d8ecbc92a3ff6"
	identityBaselineClassesJSON     = "4380425640dd5069ccbcbdb63c9e4c3e37810f0c9bfd1afb47eb07096cba2d04"
	identityBaselineClassesCommand  = "79f965ae0868a02c273ef0d65460f541770d428836f0d5db2f9404d63fba2934"
	identityBaselineMixedSnapshot   = "f6fad20582c72ec7d8e749d1c209a284de0e48fb7bdf2a20570f4d1ef4bc477e"
	identityBaselineMixedJSON       = "3bab78c30462324110cc90cf1e679e119c9587781e4de3f77ddb029cc1d9d91e"
	identityBaselineMixedCommand    = "8046af365c167d99cba69d2478445dcadeef791166e1af71fa2eeae4b3e1dad2"
)

// T12j2 — captura baseline previa: vectores deterministas v3 con los
// constructores y fixtures actuales, antes de cambiar producción.
func TestIdentityBaselineV3Vectors(t *testing.T) {
	base, original, family := lapFamilyCorrectionExample(t)
	inputs := mixedSnapshotScalar(t, base)
	session := mixedSnapshotSession(base)
	classes := mixedSnapshotClassRequests(base)
	command := CorrectionSaveCommand{ExpectedRevision: "baseline-parent", CommandID: "baseline-command", Reason: "baseline capture", LocalAuthorID: "baseline"}
	for _, tc := range []struct {
		name     string
		inputs   []SampleCorrectionInput
		original LapValidityAnalysis
		families []LapFamilyUseCorrection
		scalars  []SampleValueCorrection
	}{
		{"classes-alone", nil, LapValidityAnalysis{}, nil, nil},
		{"three-groups", inputs, original, []LapFamilyUseCorrection{family}, []SampleValueCorrection{inputs[0].Request}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			snapshot, err := PrepareMixedCorrectionSnapshot(base, tc.inputs, tc.original, tc.families, session, classes)
			if err != nil {
				t.Fatal(err)
			}
			wire, err := json.Marshal(snapshot)
			if err != nil {
				t.Fatal(err)
			}
			sum := sha256.Sum256(wire)
			digest, err := correctionCommandDigestMixed(base, command, tc.scalars, tc.families, classes)
			if err != nil {
				t.Fatal(err)
			}
			t.Logf("baseline %s contract=%s snapshot=%s jsonsha256=%s command=%s", tc.name, snapshot.ContractVersion, snapshot.SnapshotID, hex.EncodeToString(sum[:]), digest)
		})
	}
}

func TestIdentityBaselineV3VectorsFixed(t *testing.T) {
	base, original, family := lapFamilyCorrectionExample(t)
	inputs := mixedSnapshotScalar(t, base)
	session := mixedSnapshotSession(base)
	classes := mixedSnapshotClassRequests(base)
	command := CorrectionSaveCommand{ExpectedRevision: "baseline-parent", CommandID: "baseline-command", Reason: "baseline capture", LocalAuthorID: "baseline"}
	for _, tc := range []struct {
		name       string
		inputs     []SampleCorrectionInput
		original   LapValidityAnalysis
		families   []LapFamilyUseCorrection
		scalars    []SampleValueCorrection
		snapshotID string
		jsonSHA256 string
		commandID  string
	}{
		{"classes-alone", nil, LapValidityAnalysis{}, nil, nil, identityBaselineClassesSnapshot, identityBaselineClassesJSON, identityBaselineClassesCommand},
		{"three-groups", inputs, original, []LapFamilyUseCorrection{family}, []SampleValueCorrection{inputs[0].Request}, identityBaselineMixedSnapshot, identityBaselineMixedJSON, identityBaselineMixedCommand},
	} {
		t.Run(tc.name, func(t *testing.T) {
			snapshot, err := PrepareMixedCorrectionSnapshot(base, tc.inputs, tc.original, tc.families, session, classes)
			if err != nil {
				t.Fatal(err)
			}
			if snapshot.ContractVersion != "analysis.mixed-snapshot.v3" || snapshot.SnapshotID != tc.snapshotID {
				t.Fatalf("v3 movido: %+v", snapshot)
			}
			wire, err := json.Marshal(snapshot)
			if err != nil {
				t.Fatal(err)
			}
			sum := sha256.Sum256(wire)
			if hex.EncodeToString(sum[:]) != tc.jsonSHA256 {
				t.Fatal("JSON v3 movido")
			}
			if bytes.Contains(wire, []byte("canonicalCombination")) {
				t.Fatal("v3 emite identidad por accidente")
			}
			digest, err := correctionCommandDigestMixed(base, command, tc.scalars, tc.families, classes)
			if err != nil || digest != tc.commandID {
				t.Fatalf("digest de comando v3 movido: %s, %v", digest, err)
			}
		})
	}
}

func TestCanonicalMixedSnapshotV4Identity(t *testing.T) {
	base, _, _, _ := correctionExample()
	session := mixedSnapshotSession(base)
	target := canonicalTestTarget("Autodromo Nazionale Monza", "Autodromo Nazionale Monza", "Ferrari 499P", "Hypercar")
	requests := []ClassificationCorrection{
		canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Autodromo Nazionale Monza"),
		canonicalTestRequest(base, target, ClassificationFieldTrackLayout, "GP", "Autodromo Nazionale Monza"),
		canonicalTestRequest(base, target, ClassificationFieldCarName, "Oreca 07", "Ferrari 499P"),
		canonicalTestRequest(base, target, ClassificationFieldCarClass, "LMP2", "Hypercar"),
	}
	snapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, requests, target)
	if err != nil {
		t.Fatalf("v4 identidad rechazado: %v", err)
	}
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v4" || len(snapshot.Classifications) != 4 || len(snapshot.Corrections) != 0 || len(snapshot.FamilyUses) != 0 {
		t.Fatalf("forma v4 incorrecta: %+v", snapshot)
	}
	if snapshot.CanonicalCombination == nil || !reflect.DeepEqual(*snapshot.CanonicalCombination, *target) {
		t.Fatalf("target no conservado: %+v", snapshot.CanonicalCombination)
	}
	if len(snapshot.SnapshotID) != 64 || snapshot.SnapshotID == identityBaselineClassesSnapshot || snapshot.SnapshotID == identityBaselineMixedSnapshot {
		t.Fatalf("digest v4 indistinguible: %s", snapshot.SnapshotID)
	}
	wire, err := json.Marshal(snapshot)
	if err != nil || !bytes.Contains(wire, []byte("canonicalCombination")) {
		t.Fatal("v4 sin target en wire", err)
	}
	before := *snapshot.CanonicalCombination
	target.TrackName = "MUTADO"
	if !reflect.DeepEqual(*snapshot.CanonicalCombination, before) {
		t.Fatal("el snapshot aliasa el target del llamador")
	}
}

func TestCanonicalMixedSnapshotDistinctIdentities(t *testing.T) {
	base, _, _, _ := correctionExample()
	session := mixedSnapshotSession(base)
	near := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	far := canonicalTestTarget("Autodromo Nazionale Monza", "GP", "Oreca 07", "LMP2")
	nearReq := []ClassificationCorrection{canonicalTestRequest(base, near, ClassificationFieldTrackName, "Imola", "Monza")}
	farReq := []ClassificationCorrection{canonicalTestRequest(base, far, ClassificationFieldTrackName, "Imola", "Autodromo Nazionale Monza")}
	nearSnapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, nearReq, near)
	if err != nil {
		t.Fatal(err)
	}
	farSnapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, farReq, far)
	if err != nil {
		t.Fatal(err)
	}
	if nearSnapshot.SnapshotID == farSnapshot.SnapshotID {
		t.Fatal("el digest v4 no cubre el target")
	}
}

func TestCanonicalMixedSnapshotV4ThreeGroups(t *testing.T) {
	base, original, family := lapFamilyCorrectionExample(t)
	inputs := mixedSnapshotScalar(t, base)
	session := mixedSnapshotSession(base)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	track := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")
	snapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family}, session, []ClassificationCorrection{track}, target)
	if err != nil {
		t.Fatalf("v4 mixto rechazado: %v", err)
	}
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v4" || len(snapshot.Corrections) != 1 || len(snapshot.FamilyUses) != 1 || len(snapshot.Classifications) != 1 {
		t.Fatalf("forma v4 mixta incorrecta: %+v", snapshot)
	}
	if snapshot.CanonicalCombination == nil || snapshot.CanonicalCombination.ID != target.ID {
		t.Fatalf("target mixto perdido: %+v", snapshot.CanonicalCombination)
	}
}

func TestCanonicalMixedSnapshotOrderStable(t *testing.T) {
	base, _, _, _ := correctionExample()
	session := mixedSnapshotSession(base)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	track := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")
	car := canonicalTestRequest(base, target, ClassificationFieldCarName, "Oreca 07", "Oreca 07")
	first, err := PrepareCanonicalMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, []ClassificationCorrection{track, car}, target)
	if err != nil {
		t.Fatal(err)
	}
	second, err := PrepareCanonicalMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, []ClassificationCorrection{car, track}, target)
	if err != nil {
		t.Fatal(err)
	}
	if first.SnapshotID != second.SnapshotID {
		t.Fatal("orden de entrada altera el digest")
	}
}

func TestCanonicalMixedSnapshotInert(t *testing.T) {
	base, original, family := lapFamilyCorrectionExample(t)
	inputs := mixedSnapshotScalar(t, base)
	session := mixedSnapshotSession(base)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	oldOnly := mixedSnapshotClassRequests(base)
	track := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")
	for _, tc := range []struct {
		name    string
		classes []ClassificationCorrection
		target  *CombinationIdentity
		want    error
	}{
		{"sin clases con target", nil, target, ErrInvalidCorrection},
		{"clases viejas con target", oldOnly, target, ErrInvalidCorrection},
		{"identidad sin target", []ClassificationCorrection{track}, nil, ErrCorrectionTarget},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := PrepareCanonicalMixedCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family}, session, tc.classes, tc.target); !errors.Is(err, tc.want) {
				t.Fatalf("se esperaba %v, llegó %v", tc.want, err)
			}
		})
	}
}

func TestCanonicalMixedSnapshotDelegatesExact(t *testing.T) {
	base, original, family := lapFamilyCorrectionExample(t)
	inputs := mixedSnapshotScalar(t, base)
	session := mixedSnapshotSession(base)
	oldOnly := mixedSnapshotClassRequests(base)
	for _, tc := range []struct {
		name     string
		inputs   []SampleCorrectionInput
		original LapValidityAnalysis
		families []LapFamilyUseCorrection
		classes  []ClassificationCorrection
	}{
		{"clases solas", nil, LapValidityAnalysis{}, nil, oldOnly},
		{"tres grupos", inputs, original, []LapFamilyUseCorrection{family}, oldOnly},
		{"vacío", nil, LapValidityAnalysis{}, nil, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			legacy, err := PrepareMixedCorrectionSnapshot(base, tc.inputs, tc.original, tc.families, session, tc.classes)
			if err != nil {
				t.Fatal(err)
			}
			delegated, err := PrepareCanonicalMixedCorrectionSnapshot(base, tc.inputs, tc.original, tc.families, session, tc.classes, nil)
			if err != nil || !reflect.DeepEqual(legacy, delegated) {
				t.Fatalf("delegación sin identidad alterada: %+v, %v", delegated, err)
			}
		})
	}
}

func TestCombineCanonicalMixedSnapshotRejectsInertTarget(t *testing.T) {
	base, _, _, _ := correctionExample()
	session := mixedSnapshotSession(base)
	classes, err := PrepareClassificationCorrectionSet(base, session, mixedSnapshotClassRequests(base))
	if err != nil {
		t.Fatal(err)
	}
	scalar, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	if _, err := combineCanonicalMixedSnapshot(scalar, nil, classes, target); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatalf("se esperaba ErrInvalidCorrection, llegó %v", err)
	}
	if _, err := combineCanonicalMixedSnapshot(scalar, nil, classes, nil); err != nil {
		t.Fatalf("delegación sin identidad rechazada: %v", err)
	}
}

func TestCanonicalMixedSnapshotJointQuota(t *testing.T) {
	base, original, family := lapFamilyCorrectionExample(t)
	session := mixedSnapshotSession(base)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	track := ClassificationCorrection{Base: base, Field: ClassificationFieldTrackName, ExpectedOriginal: "Imola", Replacement: "Monza", Reason: "Reviewed identity", Provenance: ClassificationProvenanceManual, CanonicalCombinationID: target.ID}
	inputs := canonicalQuotaScalarInputs(base, MaxSampleCorrections-2)
	// 254 escalares + 1 familia + 1 identidad = 256 operaciones válidas.
	snapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family}, session, []ClassificationCorrection{track}, target)
	if err != nil {
		t.Fatalf("256 operaciones válidas rechazadas: %v", err)
	}
	if snapshot.ContractVersion != "analysis.mixed-snapshot.v4" || len(snapshot.Corrections) != MaxSampleCorrections-2 || len(snapshot.FamilyUses) != 1 || len(snapshot.Classifications) != 1 {
		t.Fatalf("forma v4 incompleta: %+v", snapshot)
	}
	// Un 255º escalar válido y distinto deja 257: cuota con snapshot vacío.
	over := canonicalQuotaScalarInputs(base, MaxSampleCorrections-1)
	failed, err := PrepareCanonicalMixedCorrectionSnapshot(base, over, original, []LapFamilyUseCorrection{family}, session, []ClassificationCorrection{track}, target)
	if !errors.Is(err, ErrInvalidCorrection) || !reflect.DeepEqual(failed, PreparedSampleCorrectionSnapshot{}) {
		t.Fatalf("se esperaba cuota atómica, llegó %+v, %v", failed, err)
	}
}

// canonicalQuotaScalarInputs construye n entradas escalares válidas y
// distintas desde el canal de ejemplo, con índices correspondientes en Sample
// y Request.Target y valores/canal/unidad/precondición completos.
func canonicalQuotaScalarInputs(base SourceAnalysisRef, n int) []SampleCorrectionInput {
	_, channel, _, _ := correctionExample()
	inputs := make([]SampleCorrectionInput, 0, n)
	for i := 0; i < n; i++ {
		value := HistoricalValue{Column: "value", Present: true, Quality: QualityValid, Scalar: HistoricalScalar{Kind: ScalarNumber, Number: 10 + float64(i)}}
		sample := HistoricalSample{Index: int64(i), Values: []HistoricalValue{value}}
		request := SampleValueCorrection{Base: base, Target: SampleCorrectionTarget{ChannelID: channel.ID, Column: "value", SampleIndex: int64(i)}, Unit: channel.Unit, Expected: value, Replacement: HistoricalScalar{Kind: ScalarNumber, Number: 0}, Reason: "Reviewed source measurement"}
		inputs = append(inputs, SampleCorrectionInput{Channel: channel, Sample: sample, Request: request})
	}
	return inputs
}
