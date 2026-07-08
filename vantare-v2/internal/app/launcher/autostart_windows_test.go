//go:build windows

package launcher

import (
	"testing"

	"golang.org/x/sys/windows/registry"
)

func TestParseLaunchFlag(t *testing.T) {
	cases := []struct {
		args   []string
		wantID string
		wantOK bool
	}{
		{[]string{"--launch=creator"}, "creator", true},
		{[]string{"--launch="}, "", false},
		{[]string{"--launch"}, "", false},
		{[]string{""}, "", false},
		{[]string{"--other=foo"}, "", false},
	}
	for _, c := range cases {
		id, ok := ParseLaunchFlag(c.args)
		if id != c.wantID || ok != c.wantOK {
			t.Errorf("ParseLaunchFlag(%v): got (%q, %v), want (%q, %v)", c.args, id, ok, c.wantID, c.wantOK)
		}
	}
}

func TestRegisterUnregisterAutostart(t *testing.T) {
	profileID := "test-autostart-idempotent"

	// Limpiar estado previo por si un test anterior falló.
	_ = UnregisterAutostart(profileID)

	// Registrar primera vez.
	if err := RegisterAutostart(profileID); err != nil {
		t.Fatalf("RegisterAutostart (1st): %v", err)
	}

	// Registrar segunda vez — debe ser idempotente.
	if err := RegisterAutostart(profileID); err != nil {
		t.Fatalf("RegisterAutostart (2nd): %v", err)
	}

	// Verificar que existe una entrada con el valor correcto.
	k, err := registry.OpenKey(registry.CURRENT_USER, autostartKeyPath, registry.READ)
	if err != nil {
		t.Fatalf("open key: %v", err)
	}
	defer k.Close()
	val, _, err := k.GetStringValue(autostartValueName(profileID))
	if err != nil {
		t.Fatalf("entry not found after register: %v", err)
	}
	if val == "" {
		t.Error("entry value is empty")
	}

	// Desregistrar.
	if err := UnregisterAutostart(profileID); err != nil {
		t.Fatalf("UnregisterAutostart: %v", err)
	}

	// Verificar que ya no existe.
	if _, _, err := k.GetStringValue(autostartValueName(profileID)); err == nil {
		t.Fatal("entry should be deleted after UnregisterAutostart")
	}
}

func TestAutostartUnknownProfileIDRemovesRegistryEntry(t *testing.T) {
	profileID := "test-autostart-unknown"

	// Limpiar estado previo.
	_ = UnregisterAutostart(profileID)

	// Registrar una entrada (simula que se creó cuando el perfil existía).
	if err := RegisterAutostart(profileID); err != nil {
		t.Fatalf("RegisterAutostart: %v", err)
	}

	// Verificar que la entrada existe.
	k, err := registry.OpenKey(registry.CURRENT_USER, autostartKeyPath, registry.READ)
	if err != nil {
		t.Fatalf("open key: %v", err)
	}
	defer k.Close()
	if _, _, err := k.GetStringValue(autostartValueName(profileID)); err != nil {
		t.Fatalf("entry should exist before removal: %v", err)
	}

	// Simular perfil desconocido: desregistrar (como hace handleLaunchFlag cuando
	// el profileID no existe en settings).
	if err := UnregisterAutostart(profileID); err != nil {
		t.Fatalf("UnregisterAutostart: %v", err)
	}

	// Verificar que se eliminó.
	if _, _, err := k.GetStringValue(autostartValueName(profileID)); err == nil {
		t.Fatal("registry entry should be removed when profileID is unknown")
	}
}
