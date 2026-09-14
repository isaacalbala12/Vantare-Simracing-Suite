package telemetrytransport

import (
	"encoding/json"
	"os"
	"testing"
)

type browserContractFixture struct {
	ProjectionVersion uint64                           `json:"projectionVersion"`
	MaxPayloadBytes   int                              `json:"maxPayloadBytes"`
	OverlayPull       browserOverlayPullWire           `json:"overlayPull"`
	StatusStates      []string                         `json:"statusStates"`
	Products          map[ProductID]browserProductWire `json:"products"`
}

type browserOverlayPullWire struct {
	RequestRoute string `json:"requestRoute"`
	CloseRoute   string `json:"closeRoute"`
}

type browserProductWire struct {
	ProjectionEvent string `json:"projectionEvent"`
	StatusEvent     string `json:"statusEvent"`
	FactEvent       string `json:"factEvent"`
	ProjectionRoute string `json:"projectionRoute"`
	FactsRoute      string `json:"factsRoute"`
}

func TestBrowserContractFixtureMatchesGoTransport(t *testing.T) {
	encoded, err := os.ReadFile("testdata/transport_contract_v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture browserContractFixture
	if err := json.Unmarshal(encoded, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.ProjectionVersion != 1 {
		t.Fatalf("projection version = %d, want 1", fixture.ProjectionVersion)
	}
	if fixture.MaxPayloadBytes != MaxPayloadBytes {
		t.Fatalf("max payload = %d, want %d", fixture.MaxPayloadBytes, MaxPayloadBytes)
	}
	if fixture.OverlayPull != (browserOverlayPullWire{
		RequestRoute: overlayPullRequestRoute,
		CloseRoute:   overlayPullCloseRoute,
	}) {
		t.Fatalf("overlay pull fixture drift: %+v", fixture.OverlayPull)
	}
	// R7a: ProductOverlay esta retirado; el contrato browser cubre los
	// tres productos vivos.
	products := []ProductID{
		ProductEngineer,
		ProductStrategy,
		ProductAnalysis,
	}
	if len(fixture.Products) != len(products) {
		t.Fatalf("products = %d, want %d", len(fixture.Products), len(products))
	}
	for _, product := range products {
		wire, ok := fixture.Products[product]
		if !ok {
			t.Fatalf("missing product %q", product)
		}
		if wire.ProjectionEvent != EventName(product, EventSnapshot) ||
			wire.StatusEvent != EventName(product, EventStatus) ||
			wire.FactEvent != EventName(product, EventFact) ||
			wire.ProjectionRoute != ProjectionRoute(product) ||
			wire.FactsRoute != FactsRoute(product) {
			t.Fatalf("browser fixture drift for %q: %+v", product, wire)
		}
	}
	for _, state := range fixture.StatusStates {
		if !knownStatusState(state) {
			t.Fatalf("unknown fixture status %q", state)
		}
	}
	if len(fixture.StatusStates) != 8 {
		t.Fatalf("status states = %d, want 8", len(fixture.StatusStates))
	}
}
