package telemetryanalysis

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// T12j8a — contrato wire v4. La fixture comprometida en
// frontend/src/strategy/testdata/analysis-identity-snapshot-v4.json sale del
// constructor canónico J2 con helpers existentes; este test la compara
// estructura a estructura contra la salida real. No es banco real ni un
// generador productivo: si falta el archivo, el fallo es de setup y muestra
// el JSON esperado para comprometerlo.

const identityWireFixturePath = "../../frontend/src/strategy/testdata/analysis-identity-snapshot-v4.json"

func TestIdentityWireFixtureMatchesCanonicalConstructor(t *testing.T) {
	base, original, _, input, _, target := identityStoreExample(t)
	legacy := ClassificationCorrection{Base: base, Field: ClassificationFieldSessionType, ExpectedOriginal: "race", Replacement: "qualify", Reason: "Reviewed session type", Provenance: ClassificationProvenanceManual}
	input.Classifications = append(input.Classifications, legacy)
	snapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base, input.Samples, original, input.FamilyUses, input.Session, input.Classifications, target)
	if err != nil {
		t.Fatal(err)
	}
	produced, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Clean(identityWireFixturePath))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			indented, indentErr := json.MarshalIndent(snapshot, "", "  ")
			if indentErr != nil {
				t.Fatal(indentErr)
			}
			t.Fatalf("fixture v4 ausente; JSON esperado para comprometer:\n%s", indented)
		}
		t.Fatal(err)
	}
	var committed, real any
	if err := json.Unmarshal(raw, &committed); err != nil {
		t.Fatalf("fixture v4 no decodifica: %v", err)
	}
	if err := json.Unmarshal(produced, &real); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(real, committed) {
		t.Fatalf("fixture v4 diverge del constructor J2:\nreal:    %s\nfixture: %s", produced, raw)
	}
}
