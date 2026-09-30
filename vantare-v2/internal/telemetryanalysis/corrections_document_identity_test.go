package telemetryanalysis

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
)

// T12j2 — lectura de documento con identidad v4. Fixtures, sin banco,
// catálogo, custodia ni autorización real. El catálogo comprueba la
// pertenencia del destino en nuevas escrituras; no autentica una historia
// local falsificada coherentemente: eso no lo prometen estos hashes.

func canonicalMixedDocumentExample(t *testing.T) (SourceAnalysisRef, correctionDocument, *CombinationIdentity) {
	t.Helper()
	base, original, family := lapFamilyCorrectionExample(t)
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	inputs := mixedSnapshotScalar(t, base)
	scalar := inputs[0].Request
	session := mixedSnapshotSession(base)
	classes := mixedSnapshotClassRequests(base)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	track := ClassificationCorrection{Base: base, Field: ClassificationFieldTrackName, ExpectedOriginal: "Imola", Replacement: "Monza", Reason: "Reviewed identity", Provenance: ClassificationProvenanceManual, CanonicalCombinationID: target.ID}
	v2Snapshot, err := PrepareObservationCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family})
	if err != nil {
		t.Fatal(err)
	}
	v3Snapshot, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, classes)
	if err != nil {
		t.Fatal(err)
	}
	v4Snapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base, inputs, original, []LapFamilyUseCorrection{family}, session, []ClassificationCorrection{track}, target)
	if err != nil {
		t.Fatal(err)
	}
	restoreSnapshot, err := PrepareMixedCorrectionSnapshot(base, nil, LapValidityAnalysis{}, nil, session, nil)
	if err != nil {
		t.Fatal(err)
	}
	doc := correctionDocument{Version: 1, Base: base, HeadID: initial.SnapshotID, Revisions: []CorrectionRevision{}}
	type step struct {
		snapshot PreparedSampleCorrectionSnapshot
		command  CorrectionSaveCommand
		digest   string
		scalars  []SampleValueCorrection
		families []LapFamilyUseCorrection
		classes  []ClassificationCorrection
		v4       bool
	}
	steps := []step{
		{v2Snapshot, CorrectionSaveCommand{Reason: "Reviewed change", LocalAuthorID: "local"}, "", []SampleValueCorrection{scalar}, []LapFamilyUseCorrection{family}, nil, false},
		{v3Snapshot, CorrectionSaveCommand{Reason: "Reviewed change", LocalAuthorID: "local"}, "", nil, nil, classes, false},
		{v4Snapshot, CorrectionSaveCommand{Reason: "Reviewed change", LocalAuthorID: "local"}, "", []SampleValueCorrection{scalar}, []LapFamilyUseCorrection{family}, []ClassificationCorrection{track}, true},
		{restoreSnapshot, CorrectionSaveCommand{Reason: "Restore original session", LocalAuthorID: "local"}, "", nil, nil, nil, false},
	}
	for i, s := range steps {
		command := s.command
		command.ExpectedRevision = doc.HeadID
		command.CommandID = fmt.Sprintf("command-%d", i)
		var digest string
		var err error
		if s.v4 {
			digest, err = correctionCommandDigestCanonicalMixed(base, command, s.scalars, s.families, s.classes)
		} else {
			digest, err = correctionCommandDigestMixed(base, command, s.scalars, s.families, s.classes)
		}
		if err != nil {
			t.Fatal(err)
		}
		revision := CorrectionRevision{ParentRevisionID: doc.HeadID, Command: command, CommandDigest: digest, CreatedAt: "2026-09-10T12:00:00Z", Snapshot: s.snapshot}
		id, err := correctionRevisionDigest(revision)
		if err != nil {
			t.Fatal(err)
		}
		revision.RevisionID, doc.HeadID = id, id
		doc.Revisions = append(doc.Revisions, revision)
	}
	return base, doc, target
}

func TestCanonicalDocumentV4ChainRoundtrip(t *testing.T) {
	base, doc, _ := canonicalMixedDocumentExample(t)
	if doc.Revisions[2].Snapshot.ContractVersion != "analysis.mixed-snapshot.v4" {
		t.Fatalf("cadena sin v4: %+v", doc.Revisions[2].Snapshot)
	}
	if doc.Revisions[3].Snapshot.ContractVersion != "analysis.sample-snapshot.v1" {
		t.Fatalf("restauración sin v1: %+v", doc.Revisions[3].Snapshot)
	}
	data, err := encodeCorrectionDocument(doc)
	if err != nil {
		t.Fatal(err)
	}
	read, err := decodeCorrectionDocument(data, base)
	if err != nil || !reflect.DeepEqual(read, doc) {
		t.Fatal("cadena v1/v2/v3/v4/restauración sin roundtrip exacto", err)
	}
}

func TestCanonicalDocumentV4RequiresTarget(t *testing.T) {
	base, doc, _ := canonicalMixedDocumentExample(t)
	t.Run("v4 sin target", func(t *testing.T) {
		dropped := doc
		dropped.Revisions = append([]CorrectionRevision(nil), doc.Revisions...)
		revision := dropped.Revisions[2]
		revision.Snapshot.CanonicalCombination = nil
		dropped.Revisions[2] = revision
		data, err := encodeCorrectionDocument(dropped)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := decodeCorrectionDocument(data, base); !errors.Is(err, ErrCorruptCorrections) {
			t.Fatalf("se esperaba ErrCorruptCorrections, llegó %v", err)
		}
	})
	inject := func(t *testing.T, old, injection string) {
		t.Helper()
		_, fresh, _ := canonicalMixedDocumentExample(t)
		data, err := encodeCorrectionDocument(fresh)
		if err != nil {
			t.Fatal(err)
		}
		wire := string(data)
		if !strings.Contains(wire, old) {
			t.Fatalf("ancla ausente: %s", old)
		}
		wire = strings.Replace(wire, old, injection, 1)
		if _, err := decodeCorrectionDocument([]byte(wire), base); !errors.Is(err, ErrCorruptCorrections) {
			t.Fatalf("presencia %s aceptada, llegó %v", injection, err)
		}
	}
	t.Run("null en v3", func(t *testing.T) {
		inject(t, `"snapshot":{"contractVersion":"analysis.mixed-snapshot.v3"`, `"snapshot":{"canonicalCombination":null,"contractVersion":"analysis.mixed-snapshot.v3"`)
	})
	t.Run("null en v1", func(t *testing.T) {
		inject(t, `"snapshot":{"contractVersion":"analysis.sample-snapshot.v1"`, `"snapshot":{"canonicalCombination":null,"contractVersion":"analysis.sample-snapshot.v1"`)
	})
	t.Run("null en v2", func(t *testing.T) {
		inject(t, `"snapshot":{"contractVersion":"analysis.observation-snapshot.v2"`, `"snapshot":{"canonicalCombination":null,"contractVersion":"analysis.observation-snapshot.v2"`)
	})
	t.Run("null en v4", func(t *testing.T) {
		_, fresh, _ := canonicalMixedDocumentExample(t)
		data, err := encodeCorrectionDocument(fresh)
		if err != nil {
			t.Fatal(err)
		}
		var wire map[string]any
		if err := json.Unmarshal(data, &wire); err != nil {
			t.Fatal(err)
		}
		revisions, ok := wire["revisions"].([]any)
		if !ok || len(revisions) != 4 {
			t.Fatal("cadena inesperada")
		}
		snapshot, ok := revisions[2].(map[string]any)["snapshot"].(map[string]any)
		if !ok {
			t.Fatal("snapshot v4 ausente")
		}
		snapshot["canonicalCombination"] = nil
		raw, err := json.Marshal(wire)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := decodeCorrectionDocument(raw, base); !errors.Is(err, ErrCorruptCorrections) {
			t.Fatalf("null en v4 aceptado, llegó %v", err)
		}
	})
	t.Run("objeto en v1", func(t *testing.T) {
		inject(t, `"snapshot":{"contractVersion":"analysis.sample-snapshot.v1"`, `"snapshot":{"canonicalCombination":{"simId":"lmu"},"contractVersion":"analysis.sample-snapshot.v1"`)
	})
	t.Run("capitalización alternativa en v3", func(t *testing.T) {
		inject(t, `"snapshot":{"contractVersion":"analysis.mixed-snapshot.v3"`, `"snapshot":{"CanonicalCombination":null,"contractVersion":"analysis.mixed-snapshot.v3"`)
	})
}

func freshCanonicalTestDocument(t *testing.T) (SourceAnalysisRef, correctionDocument) {
	t.Helper()
	base, doc, _ := canonicalMixedDocumentExample(t)
	data, err := encodeCorrectionDocument(doc)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeCorrectionDocument(data, base); err != nil {
		t.Fatalf("fixture válido rechazado: %v", err)
	}
	return base, doc
}

func assertCanonicalTestDocumentCorrupt(t *testing.T, base SourceAnalysisRef, doc correctionDocument) {
	t.Helper()
	data, err := encodeCorrectionDocument(doc)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeCorrectionDocument(data, base); !errors.Is(err, ErrCorruptCorrections) {
		t.Fatalf("manipulación aceptada, llegó %v", err)
	}
}

// rechainCanonicalTestDocument recalcula digest de comando y de revisión
// desde `from`, enlazando padres y cabeza. Solo funciona si el contenido
// sigue siendo válido en representación; lo usa la prueba semántica.
func rechainCanonicalTestDocument(t *testing.T, base SourceAnalysisRef, doc *correctionDocument, from int) {
	t.Helper()
	for i := from; i < len(doc.Revisions); i++ {
		revision := &doc.Revisions[i]
		scalars := make([]SampleValueCorrection, len(revision.Snapshot.Corrections))
		for k, correction := range revision.Snapshot.Corrections {
			scalars[k] = correction.Request
		}
		families := make([]LapFamilyUseCorrection, len(revision.Snapshot.FamilyUses))
		for k, correction := range revision.Snapshot.FamilyUses {
			families[k] = correction.Request
		}
		classes := make([]ClassificationCorrection, len(revision.Snapshot.Classifications))
		for k, correction := range revision.Snapshot.Classifications {
			classes[k] = correction.Request
		}
		digest, err := correctionCommandDigestCanonicalMixed(base, revision.Command, scalars, families, classes)
		if err != nil {
			t.Fatalf("recompute de comando imposible: %v", err)
		}
		revision.CommandDigest = digest
		id, err := correctionRevisionDigest(*revision)
		if err != nil {
			t.Fatal(err)
		}
		revision.RevisionID = id
		if i+1 < len(doc.Revisions) {
			doc.Revisions[i+1].ParentRevisionID = id
			doc.Revisions[i+1].Command.ExpectedRevision = id
		} else {
			doc.HeadID = id
		}
	}
}

// refreshCanonicalTestRevisionChain recalcula solo hashes de revisión y
// enlaces, dejando digests de comando obsoletos. El decoder rechaza igual
// por validación de peticiones guardadas antes de comparar digests.
func refreshCanonicalTestRevisionChain(t *testing.T, doc *correctionDocument, n int) {
	t.Helper()
	id, err := correctionRevisionDigest(doc.Revisions[n])
	if err != nil {
		t.Fatal(err)
	}
	doc.Revisions[n].RevisionID = id
	if n+1 < len(doc.Revisions) {
		doc.Revisions[n+1].ParentRevisionID = id
		doc.Revisions[n+1].Command.ExpectedRevision = id
		refreshCanonicalTestRevisionChain(t, doc, n+1)
	} else {
		doc.HeadID = id
	}
}

// resealCanonicalTestSnapshot recalcula el digest RAW v4 sobre base, los
// grupos guardados y el target guardado, asignando únicamente SnapshotID:
// el contenido alterado queda visible para el decoder. Como resealMixedRevision,
// los hashes de integridad no autentican el contenido.
func resealCanonicalTestSnapshot(t *testing.T, revision *CorrectionRevision) {
	t.Helper()
	snapshot := revision.Snapshot
	recombined, err := combineCanonicalMixedSnapshot(
		PreparedSampleCorrectionSnapshot{Base: snapshot.Base, Corrections: snapshot.Corrections},
		snapshot.FamilyUses, snapshot.Classifications, snapshot.CanonicalCombination)
	if err != nil {
		t.Fatal(err)
	}
	revision.Snapshot.SnapshotID = recombined.SnapshotID
}

func TestCanonicalDocumentRejectsTampering(t *testing.T) {
	other := canonicalTestTarget("IMOLA", "GP", "Oreca 07", "LMP2")
	t.Run("ID de target", func(t *testing.T) {
		base, doc := freshCanonicalTestDocument(t)
		revision := &doc.Revisions[2]
		revision.Snapshot.CanonicalCombination.ID = other.ID
		resealCanonicalTestSnapshot(t, revision)
		rechainCanonicalTestDocument(t, base, &doc, 2)
		assertCanonicalTestDocumentCorrupt(t, base, doc)
	})
	t.Run("original esperado", func(t *testing.T) {
		base, doc := freshCanonicalTestDocument(t)
		revision := &doc.Revisions[2]
		revision.Snapshot.Classifications[0].Request.ExpectedOriginal = "practice"
		resealCanonicalTestSnapshot(t, revision)
		rechainCanonicalTestDocument(t, base, &doc, 2)
		assertCanonicalTestDocumentCorrupt(t, base, doc)
	})
	t.Run("reemplazo fuera de target", func(t *testing.T) {
		base, doc := freshCanonicalTestDocument(t)
		revision := &doc.Revisions[2]
		revision.Snapshot.Classifications[0].Request.Replacement = "Otro"
		resealCanonicalTestSnapshot(t, revision)
		rechainCanonicalTestDocument(t, base, &doc, 2)
		assertCanonicalTestDocumentCorrupt(t, base, doc)
	})
	t.Run("target distinto con request discordante", func(t *testing.T) {
		base, doc := freshCanonicalTestDocument(t)
		doc.Revisions = doc.Revisions[:3]
		other := canonicalTestTarget("IMOLA", "GP", "Oreca 07", "LMP2")
		revision := &doc.Revisions[2]
		revision.Snapshot.CanonicalCombination = other
		resealCanonicalTestSnapshot(t, revision)
		rechainCanonicalTestDocument(t, base, &doc, 2)
		assertCanonicalTestDocumentCorrupt(t, base, doc)
	})
	t.Run("reseal intacto decodifica", func(t *testing.T) {
		base, doc := freshCanonicalTestDocument(t)
		doc.Revisions = doc.Revisions[:3]
		revision := &doc.Revisions[2]
		resealCanonicalTestSnapshot(t, revision)
		rechainCanonicalTestDocument(t, base, &doc, 2)
		data, err := encodeCorrectionDocument(doc)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := decodeCorrectionDocument(data, base); err != nil {
			t.Fatalf("reseal intacto rechazado: %v", err)
		}
	})
	t.Run("prepared original", func(t *testing.T) {
		base, doc := freshCanonicalTestDocument(t)
		doc.Revisions = doc.Revisions[:3]
		revision := &doc.Revisions[2]
		revision.Snapshot.Classifications[0].Original = "X"
		resealCanonicalTestSnapshot(t, revision)
		rechainCanonicalTestDocument(t, base, &doc, 2)
		assertCanonicalTestDocumentCorrupt(t, base, doc)
	})
	t.Run("prepared corregido", func(t *testing.T) {
		base, doc := freshCanonicalTestDocument(t)
		doc.Revisions = doc.Revisions[:3]
		revision := &doc.Revisions[2]
		revision.Snapshot.Classifications[0].Corrected = "Y"
		resealCanonicalTestSnapshot(t, revision)
		rechainCanonicalTestDocument(t, base, &doc, 2)
		assertCanonicalTestDocumentCorrupt(t, base, doc)
	})
	t.Run("referencia divergente", func(t *testing.T) {
		base, doc := freshCanonicalTestDocument(t)
		revision := &doc.Revisions[2]
		revision.Snapshot.Classifications[0].Request.CanonicalCombinationID = other.ID
		resealCanonicalTestSnapshot(t, revision)
		// Una única petición con otro ID sí es hasheable (el digest no conoce
		// target); aquí se mantiene el digest anterior y el rechazo temprano
		// lo da el target discordante en el decoder.
		refreshCanonicalTestRevisionChain(t, &doc, 2)
		assertCanonicalTestDocumentCorrupt(t, base, doc)
	})
	t.Run("base ajena", func(t *testing.T) {
		base, doc := freshCanonicalTestDocument(t)
		revision := &doc.Revisions[2]
		revision.Snapshot.Classifications[0].Request.Base.SessionID = "otra-sesion"
		resealCanonicalTestSnapshot(t, revision)
		refreshCanonicalTestRevisionChain(t, &doc, 2)
		assertCanonicalTestDocumentCorrupt(t, base, doc)
	})
	t.Run("cadena rota", func(t *testing.T) {
		base, doc := freshCanonicalTestDocument(t)
		doc.Revisions[3].ParentRevisionID = doc.Revisions[1].RevisionID
		id, err := correctionRevisionDigest(doc.Revisions[3])
		if err != nil {
			t.Fatal(err)
		}
		doc.Revisions[3].RevisionID = id
		doc.HeadID = id
		assertCanonicalTestDocumentCorrupt(t, base, doc)
	})
}

func TestCanonicalDocumentCoherentForgeryDecodes(t *testing.T) {
	// Una falsificación totalmente coherente (target autoconsistente aunque
	// ausente de todo catálogo) supera la integridad local: los hashes no la
	// detectan y no deben prometerlo. La pertenencia al catálogo se resuelve
	// al preparar una escritura nueva, no en lectura.
	base, _, _ := lapFamilyCorrectionExample(t)
	inputs := mixedSnapshotScalar(t, base)
	session := mixedSnapshotSession(base)
	forged := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	track := ClassificationCorrection{Base: base, Field: ClassificationFieldTrackName, ExpectedOriginal: "Imola", Replacement: "Monza", Reason: "Reviewed identity", Provenance: ClassificationProvenanceManual, CanonicalCombinationID: forged.ID}
	snapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base, inputs, LapValidityAnalysis{}, nil, session, []ClassificationCorrection{track}, forged)
	if err != nil {
		t.Fatal(err)
	}
	initial, err := PrepareSampleCorrectionSnapshot(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	command := CorrectionSaveCommand{ExpectedRevision: initial.SnapshotID, CommandID: "forged", Reason: "Reviewed change", LocalAuthorID: "local"}
	digest, err := correctionCommandDigestCanonicalMixed(base, command, []SampleValueCorrection{inputs[0].Request}, nil, []ClassificationCorrection{track})
	if err != nil {
		t.Fatal(err)
	}
	revision := CorrectionRevision{ParentRevisionID: initial.SnapshotID, Command: command, CommandDigest: digest, CreatedAt: "2026-09-10T12:00:00Z", Snapshot: snapshot}
	id, err := correctionRevisionDigest(revision)
	if err != nil {
		t.Fatal(err)
	}
	revision.RevisionID = id
	doc := correctionDocument{Version: 1, Base: base, HeadID: id, Revisions: []CorrectionRevision{revision}}
	data, err := encodeCorrectionDocument(doc)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeCorrectionDocument(data, base); err != nil {
		t.Fatalf("integridad local inconsistente consigo misma: %v", err)
	}
}

func TestCanonicalCommandDigestDelegatesExact(t *testing.T) {
	base, _, _, _ := correctionExample()
	command := CorrectionSaveCommand{ExpectedRevision: "parent", CommandID: "digest", Reason: "Reviewed change", LocalAuthorID: "local"}
	classes := mixedSnapshotClassRequests(base)
	legacy, err := correctionCommandDigestMixed(base, command, nil, nil, classes)
	if err != nil {
		t.Fatal(err)
	}
	delegated, err := correctionCommandDigestCanonicalMixed(base, command, nil, nil, classes)
	if err != nil || legacy != delegated {
		t.Fatalf("delegación sin identidad alterada: %s frente a %s, %v", legacy, delegated, err)
	}
}

func TestCanonicalCommandDigestIdentityGates(t *testing.T) {
	base := classificationCorrectionBase()
	command := CorrectionSaveCommand{ExpectedRevision: "parent", CommandID: "digest", Reason: "Reviewed change", LocalAuthorID: "local"}
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	good := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")
	badHex := good
	badHex.CanonicalCombinationID = "lmu:" + strings.Repeat("A", 64)
	short := good
	short.CanonicalCombinationID = "lmu:abc"
	bare := good
	bare.CanonicalCombinationID = "Monza"
	divergent := canonicalTestRequest(base, canonicalTestTarget("IMOLA", "GP", "Oreca 07", "LMP2"), ClassificationFieldCarName, "Oreca 07", "Oreca 07")
	emptyExpected := good
	emptyExpected.ExpectedOriginal = "  "
	oversized := good
	oversized.Replacement = strings.Repeat("x", 1025)
	emptyReplacement := good
	emptyReplacement.Replacement = "  "
	automatic := good
	automatic.Provenance = "auto"
	foreign := good
	foreign.Base = classificationCorrectionBase()
	foreign.Base.SessionID = "otra-sesion"
	dupe := good
	tests := []struct {
		name    string
		classes []ClassificationCorrection
		want    error
	}{
		{"hex mayúsculas", []ClassificationCorrection{badHex}, ErrInvalidCorrection},
		{"referencia corta", []ClassificationCorrection{short}, ErrInvalidCorrection},
		{"referencia sin forma", []ClassificationCorrection{bare}, ErrInvalidCorrection},
		{"referencia divergente", []ClassificationCorrection{good, divergent}, ErrCorrectionTarget},
		{"esperado vacío", []ClassificationCorrection{emptyExpected}, ErrCorrectionPrecondition},
		{"reemplazo sobredimensionado", []ClassificationCorrection{oversized}, ErrCorrectionValue},
		{"reemplazo vacío", []ClassificationCorrection{emptyReplacement}, ErrCorrectionValue},
		{"procedencia no manual", []ClassificationCorrection{automatic}, ErrInvalidCorrection},
		{"base ajena", []ClassificationCorrection{foreign}, ErrCorrectionInterpretationChanged},
		{"duplicados", []ClassificationCorrection{good, dupe}, ErrOverlappingCorrections},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := correctionCommandDigestCanonicalMixed(base, command, nil, nil, tc.classes); !errors.Is(err, tc.want) {
				t.Fatalf("se esperaba %v, llegó %v", tc.want, err)
			}
		})
	}
}

func TestCanonicalCommandDigestJointQuota(t *testing.T) {
	base, _, family := lapFamilyCorrectionExample(t)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	track := ClassificationCorrection{Base: base, Field: ClassificationFieldTrackName, ExpectedOriginal: "Imola", Replacement: "Monza", Reason: "Reviewed identity", Provenance: ClassificationProvenanceManual, CanonicalCombinationID: target.ID}
	command := CorrectionSaveCommand{ExpectedRevision: "parent", CommandID: "digest", Reason: "Reviewed change", LocalAuthorID: "local"}
	inputs := canonicalQuotaScalarInputs(base, MaxSampleCorrections-2)
	requests := make([]SampleValueCorrection, len(inputs))
	for i, input := range inputs {
		requests[i] = input.Request
	}
	// 254 escalares + 1 familia + 1 identidad = 256 operaciones válidas.
	if _, err := correctionCommandDigestCanonicalMixed(base, command, requests, []LapFamilyUseCorrection{family}, []ClassificationCorrection{track}); err != nil {
		t.Fatalf("256 operaciones válidas rechazadas: %v", err)
	}
	// Un 255º escalar válido y distinto deja 257: cuota.
	over := canonicalQuotaScalarInputs(base, MaxSampleCorrections-1)
	overRequests := make([]SampleValueCorrection, len(over))
	for i, input := range over {
		overRequests[i] = input.Request
	}
	if _, err := correctionCommandDigestCanonicalMixed(base, command, overRequests, []LapFamilyUseCorrection{family}, []ClassificationCorrection{track}); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatalf("se esperaba error de cuota, llegó %v", err)
	}
}

func TestCanonicalCommandDigestOrderStable(t *testing.T) {
	base := classificationCorrectionBase()
	command := CorrectionSaveCommand{ExpectedRevision: "parent", CommandID: "digest", Reason: "Reviewed change", LocalAuthorID: "local"}
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	track := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")
	car := canonicalTestRequest(base, target, ClassificationFieldCarName, "Oreca 07", "Oreca 07")
	first, err := correctionCommandDigestCanonicalMixed(base, command, nil, nil, []ClassificationCorrection{track, car})
	if err != nil {
		t.Fatal(err)
	}
	second, err := correctionCommandDigestCanonicalMixed(base, command, nil, nil, []ClassificationCorrection{car, track})
	if err != nil || first != second {
		t.Fatalf("orden de entrada altera el digest: %s frente a %s, %v", first, second, err)
	}
}
