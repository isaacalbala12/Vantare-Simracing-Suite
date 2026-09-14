//go:build researchbench

package bench

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app/telemetrytransport"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/engineer"
	"github.com/vantare/overlays/v2/internal/telemetry/projection/strategy"
)

// TestTransportPayloadCeiling finds the largest grid whose strategy/engineer
// projection still fits under the transport's 256 KiB hard limit
// (telemetrytransport.DefaultMaxPayloadBytes). Above it, PublishSnapshot
// returns ErrPayloadTooLarge and the frame is simply not delivered.
// R7a: la columna overlay-v1 esta retirada; Strategy ocupa su lugar.
func TestTransportPayloadCeiling(t *testing.T) {
	limit := telemetrytransport.DefaultMaxPayloadBytes
	report := fmt.Sprintf("limite de payload del transporte: %d bytes (%d KiB)\n\n", limit, limit/1024)
	report += fmt.Sprintf("%-10s %14s %14s %10s %10s\n", "vehiculos", "strategy v1", "engineer v1", "strategy", "engineer")

	strategyCeiling, engineerCeiling := 0, 0
	for count := 1; count <= 104; count++ {
		final := FinalStateFixture(t, count, 4)
		projectedStrategy, err := strategy.ProjectV1(final)
		if err != nil {
			t.Fatal(err)
		}
		strategyBytes, _ := json.Marshal(projectedStrategy.PayloadV1)
		projectedEngineer, err := engineer.ProjectV1(final)
		if err != nil {
			t.Fatal(err)
		}
		engineerBytes, _ := json.Marshal(projectedEngineer.PayloadV1)

		strategyOK := len(strategyBytes) <= limit
		engineerOK := len(engineerBytes) <= limit
		if strategyOK {
			strategyCeiling = count
		}
		if engineerOK {
			engineerCeiling = count
		}
		if count <= 3 || count%10 == 0 || count == 104 ||
			count == strategyCeiling+1 || count == engineerCeiling+1 {
			report += fmt.Sprintf("%-10d %14d %14d %10s %10s\n",
				count, len(strategyBytes), len(engineerBytes),
				verdict(strategyOK), verdict(engineerOK))
		}
	}
	report += fmt.Sprintf("\ntecho strategy v1  : %d vehiculos\n", strategyCeiling)
	report += fmt.Sprintf("techo engineer v1 : %d vehiculos\n", engineerCeiling)

	// End-to-end proof through the real Hub.
	report += "\nprueba end-to-end contra el Hub real:\n"
	for _, count := range []int{20, 60, 90, 104} {
		final := FinalStateFixture(t, count, 4)
		projected, err := strategy.ProjectV1(final)
		if err != nil {
			t.Fatal(err)
		}
		hub := telemetrytransport.NewHub(telemetrytransport.HubConfig{Product: telemetrytransport.ProductStrategy})
		status, err := telemetrytransport.NewStatus(
			telemetrytransport.ProductStrategy, 1, time.Now(),
			telemetrytransport.StatusPayload{State: "live"},
		)
		if err != nil {
			t.Fatal(err)
		}
		if err := hub.PublishStatus(status); err != nil {
			t.Fatal(err)
		}
		full, buildErr := telemetrytransport.NewStrategyFull(projected.Metadata, 1, projected.PayloadV1)
		if buildErr != nil {
			report += fmt.Sprintf("  %3d vehiculos -> NewStrategyFull ERROR: %v\n", count, buildErr)
			continue
		}
		if publishErr := hub.PublishSnapshot(full, nil); publishErr != nil {
			report += fmt.Sprintf("  %3d vehiculos -> PublishSnapshot ERROR: %v\n", count, publishErr)
			continue
		}
		report += fmt.Sprintf("  %3d vehiculos -> publicado (%d bytes)\n", count, len(full.Payload))
	}

	t.Log("\n" + report)
	if err := os.WriteFile(filepath.Join(resultsDir(t), "transport-payload-ceiling.txt"), []byte(report), 0o644); err != nil {
		t.Fatal(err)
	}
}

func verdict(ok bool) string {
	if ok {
		return "OK"
	}
	return "RECHAZADO"
}

// BenchmarkTransportBreakdown separates marshal, envelope construction
// (marshal + seal + validate) and Hub.PublishSnapshot (validate + seal again
// + clone), because the envelope is validated and sealed twice per publish.
func BenchmarkTransportBreakdown(b *testing.B) {
	for _, count := range []int{1, 20, 60} {
		payload, metadata := strategyPayload(b, count)
		b.Run(fmt.Sprintf("marshalOnly/vehicles=%d", count), func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				if _, err := json.Marshal(payload); err != nil {
					b.Fatal(err)
				}
			}
		})
		b.Run(fmt.Sprintf("NewStrategyFull/vehicles=%d", count), func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				if _, err := telemetrytransport.NewStrategyFull(metadata, 1, payload); err != nil {
					b.Fatal(err)
				}
			}
		})
		b.Run(fmt.Sprintf("PublishSnapshot/vehicles=%d", count), func(b *testing.B) {
			hub := liveHub(b)
			frames := make([]telemetrytransport.Envelope, 0, 512)
			local := metadata
			for i := 0; i < 512; i++ {
				local.Sequence++
				full, err := telemetrytransport.NewStrategyFull(local, 1, payload)
				if err != nil {
					b.Fatal(err)
				}
				frames = append(frames, full)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if i > 0 && i%len(frames) == 0 {
					b.StopTimer()
					hub = liveHub(b)
					b.StartTimer()
				}
				if err := hub.PublishSnapshot(frames[i%len(frames)], nil); err != nil {
					b.Fatalf("hub rejected frame: %v", err)
				}
			}
		})
	}
}
