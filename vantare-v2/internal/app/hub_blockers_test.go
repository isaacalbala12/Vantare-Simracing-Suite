package app_test

import (
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
)

func TestHubBlockerRegistryIsFailClosedAndGenerationBound(t *testing.T) {
	registry := app.NewHubBlockerRegistry()
	registry.Expect("hub-1")
	if registry.CanSuspend() {
		t.Fatal("registro sin estado permitió destruir")
	}
	if !registry.Update(app.HubBlockerSnapshot{Generation: "hub-1"}) || !registry.CanSuspend() {
		t.Fatal("estado limpio de la generación actual no habilitó suspensión")
	}
	registry.Expect("hub-2")
	if registry.Update(app.HubBlockerSnapshot{Generation: "hub-1"}) || registry.CanSuspend() {
		t.Fatal("una generación vieja habilitó la ventana nueva")
	}
}

func TestHubBlockerRegistrySeesBlockerBeforeMinimise(t *testing.T) {
	registry := app.NewHubBlockerRegistry()
	registry.Expect("hub")
	registry.Update(app.HubBlockerSnapshot{Generation: "hub"})
	registry.Update(app.HubBlockerSnapshot{
		Generation:    "hub",
		LauncherDraft: true,
		Reasons:       []string{"Borrador del Launcher sin guardar"},
	})
	if registry.CanSuspend() {
		t.Fatal("el bloqueador publicado justo antes de minimizar se perdió")
	}
}
