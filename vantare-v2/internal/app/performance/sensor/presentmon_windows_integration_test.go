//go:build windows

package sensor

import (
	"context"
	"os"
	"testing"
	"time"
)

// Esta prueba es opt-in porque abre una sesión ETW real y exige LMU. Sirve para
// verificar la misma ruta que producción sin convertir PresentMon en requisito
// de los gates deterministas.
func TestPresentMonWindowsIntegration(t *testing.T) {
	if os.Getenv("VANTARE_PRESENTMON_TEST") != "1" {
		t.Skip("set VANTARE_PRESENTMON_TEST=1 with LMU running")
	}
	source := NewPresentMonSource(DefaultPresentMonPath())
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := source.Start(ctx); err != nil {
		t.Fatalf("start PresentMon: %v", err)
	}
	t.Cleanup(func() {
		if err := source.Close(); err != nil {
			t.Errorf("close PresentMon: %v", err)
		}
	})
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if sample := source.Sample(); sample.Available && sample.FrametimeMS > 0 {
			t.Logf("frametimeMs=%.4f foreground=%t pid=%d session=%s", sample.FrametimeMS, sample.Foreground, source.processPID, source.sessionName)
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("PresentMon did not publish a frame within ten seconds")
}
