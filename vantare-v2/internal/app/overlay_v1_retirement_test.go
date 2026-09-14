package app

// Guard estructural R7a (ISA-894): el binario y el contrato generado ya no
// pueden contener la identidad de producto ni el wire exclusivos de
// Overlay V1. ProductOverlayV2, OverlayFrame V2 y los contratos V1
// independientes de Strategy/Engineer/Analysis quedan fuera de esta
// prohibicion. El frontend productivo legacy (adapters, shadow, harnesses)
// se retira en R7b y no se inspecciona aqui.

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestOverlayV1ContractsRetired(t *testing.T) {
	_, current, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve guard source path")
	}
	repo := filepath.Clean(filepath.Join(filepath.Dir(current), "..", ".."))

	// 1. El proyector Go Overlay V1 debe haber desaparecido: ni v1.go ni
	// ningun otro .go ejecutable en el paquete. El directorio testdata se
	// conserva como fixtures huerfanos temporales hasta R7b: los tests y
	// harnesses frontend legacy reservados a R7b siguen importando esos
	// goldens, asi que su presencia no falla este guard.
	if _, err := os.Stat(filepath.Join(repo, "internal", "telemetry", "projection", "overlay", "v1.go")); !os.IsNotExist(err) {
		t.Errorf("retired Go file still present: internal/telemetry/projection/overlay/v1.go")
	}
	if entries, err := os.ReadDir(filepath.Join(repo, "internal", "telemetry", "projection", "overlay")); err == nil {
		var sources []string
		for _, entry := range entries {
			if !entry.IsDir() && filepath.Ext(entry.Name()) == ".go" {
				sources = append(sources, entry.Name())
			}
		}
		if len(sources) != 0 {
			t.Errorf("retired Go package still has executable sources: internal/telemetry/projection/overlay (%s)", strings.Join(sources, ", "))
		}
	}

	// 2. La identidad de producto Overlay V1 no puede sobrevivir en el
	// transporte generico. Se enmascara ProductOverlayV2 antes de buscar.
	transport, err := os.ReadFile(filepath.Join(repo, "internal", "app", "telemetrytransport", "transport.go"))
	if err != nil {
		t.Fatal(err)
	}
	maskedTransport := strings.ReplaceAll(string(transport), "ProductOverlayV2", "")
	if strings.Contains(maskedTransport, "ProductOverlay") {
		t.Errorf("retired ProductOverlay still present in internal/app/telemetrytransport/transport.go")
	}

	// 3. Las raices Overlay V1 no pueden sobrevivir en contract-gen.
	// Se enmascara overlayv2 antes de buscar el paquete y el prefijo.
	contractGen, err := os.ReadFile(filepath.Join(repo, "tools", "telemetry-contract-gen", "main.go"))
	if err != nil {
		t.Fatal(err)
	}
	maskedGen := strings.ReplaceAll(string(contractGen), "overlayv2", "")
	maskedGen = strings.ReplaceAll(maskedGen, "OverlayV2", "")
	maskedGen = strings.ReplaceAll(maskedGen, "overlay-v2", "")
	// OverlayCapabilityModesV2 es V2 vivo y contiene el substring
	// "OverlayCapability": se enmascara antes de prohibirlo.
	maskedGen = strings.ReplaceAll(maskedGen, "OverlayCapabilityModesV2", "")
	for _, forbidden := range []string{
		"projection/overlay\"",
		"overlay.Capability",
		"overlay.GroundPositionV1",
		"overlay.SnapshotV1",
		"overlay.PayloadV1",
		"overlay.VehicleV1",
		"overlay.ControlHistoryV1",
		"overlay.DeltaHistoryV1",
		"OverlayCapability",
		"OverlayGroundPositionV1",
		"OverlaySnapshotV1",
		"OverlayPayloadV1",
		"OverlayVehicleV1",
		"OverlayControlHistoryV1",
		"OverlayControlSampleV1",
		"OverlayDeltaHistoryV1",
		"OverlayDeltaSampleV1",
	} {
		if strings.Contains(maskedGen, forbidden) {
			t.Errorf("retired Overlay V1 root still present in tools/telemetry-contract-gen/main.go: %q", forbidden)
		}
	}

	// 4. El wire TS generado no puede contener tipos Overlay V1 ni el
	// producto "overlay". Se enmascaran overlay-v2/OverlayV2 primero para
	// no confundir el producto vivo con el retirado.
	generated, err := os.ReadFile(filepath.Join(repo, "frontend", "src", "generated", "telemetry.ts"))
	if err != nil {
		t.Fatal(err)
	}
	maskedTS := strings.ReplaceAll(string(generated), "overlay-v2", "")
	maskedTS = strings.ReplaceAll(maskedTS, "OverlayV2", "")
	// OverlayCapabilityModesV2 es V2 vivo y contiene el substring
	// "OverlayCapability": se enmascara antes de prohibirlo.
	maskedTS = strings.ReplaceAll(maskedTS, "OverlayCapabilityModesV2", "")
	for _, forbidden := range []string{
		"OverlayCapability",
		"OverlayGroundPositionV1",
		"OverlaySnapshotV1",
		"OverlayPayloadV1",
		"OverlayVehicleV1",
		"OverlayControlHistoryV1",
		"OverlayControlSampleV1",
		"OverlayDeltaHistoryV1",
		"OverlayDeltaSampleV1",
		`"overlay"`,
	} {
		if strings.Contains(maskedTS, forbidden) {
			t.Errorf("retired Overlay V1 wire still present in frontend/src/generated/telemetry.ts: %q", forbidden)
		}
	}
}
