package app

import (
	"os"
	"path/filepath"
	"reflect"
	goruntime "runtime"
	"strings"
	"testing"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
)

// R6b: el Hub Overlay V1 inerte esta fisicamente retirado del runtime. Ya no
// hay campo Hub Overlay, ni accessor Hub(), ni Transport ni contadores
// Overlay en metricas, ni construccion ProductOverlay en fuente. Solo queda
// strategyHub con su StrategyTransport y su contador Strategy.
func TestOverlayV1HubPhysicallyRetired(t *testing.T) {
	var remnants []string

	hubType := reflect.TypeOf((*telemetrytransport.Hub)(nil))
	runtimeType := reflect.TypeOf(TelemetryCoreRuntime{})
	var hubFields []string
	for index := 0; index < runtimeType.NumField(); index++ {
		field := runtimeType.Field(index)
		if field.Type == hubType {
			hubFields = append(hubFields, field.Name)
		}
	}
	if len(hubFields) != 1 || hubFields[0] != "strategyHub" {
		remnants = append(remnants, "runtime Hub fields = ["+strings.Join(hubFields, " ")+"], want [strategyHub]")
	}
	if _, ok := runtimeType.FieldByName("hub"); ok {
		remnants = append(remnants, "runtime field hub still present")
	}
	if _, ok := reflect.PointerTo(runtimeType).MethodByName("Hub"); ok {
		remnants = append(remnants, "runtime accessor Hub() still present")
	}

	metricsType := reflect.TypeOf(TelemetryCoreMetrics{})
	for _, retired := range []string{"ProjectionsPublished", "OverlayProjectionsPublished", "Transport"} {
		if _, ok := metricsType.FieldByName(retired); ok {
			remnants = append(remnants, "metrics field "+retired+" still present")
		}
	}

	_, current, _, ok := goruntime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve runtime source path")
	}
	source, err := os.ReadFile(filepath.Join(filepath.Dir(current), "telemetry_core_runtime.go"))
	if err != nil {
		t.Fatal(err)
	}
	// ProductOverlayV2 es el transporte vivo y contiene el prefijo
	// ProductOverlay: se enmascara para que el token sin coma no lo marque.
	text := strings.ReplaceAll(string(source), "ProductOverlayV2", "")
	for _, forbidden := range []string{
		"overlayprojection",
		"Product: telemetrytransport.ProductOverlay",
		"func (runtime *TelemetryCoreRuntime) Hub()",
		"runtime.hub",
	} {
		if strings.Contains(text, forbidden) {
			remnants = append(remnants, "runtime source still contains "+overlayGuardQuoted(forbidden))
		}
	}

	if len(remnants) != 0 {
		t.Fatalf("retired Overlay V1 Hub remnants:\n%s", strings.Join(remnants, "\n"))
	}

	runtime, err := NewTelemetryCoreRuntime(TelemetryCoreRuntimeConfig{StrategyPublicTransport: true})
	if err != nil {
		t.Fatal(err)
	}
	if runtime.StrategyHub() == nil {
		t.Fatal("StrategyHub() = nil, want the single surviving product hub")
	}
	metrics := runtime.Metrics()
	if metrics.StrategyTransport.CurrentSubscribers != 0 {
		t.Fatalf("fresh Strategy transport subscribers = %d, want 0", metrics.StrategyTransport.CurrentSubscribers)
	}
}

func overlayGuardQuoted(value string) string {
	return "\"" + value + "\""
}
