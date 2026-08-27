package updater

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadSettingsMissingReturnsDefault(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	s, err := LoadSettings(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Channel != ChannelStable {
		t.Fatalf("channel=%s, want stable", s.Channel)
	}
}

func TestSaveAndLoadSettings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	want := &Settings{Channel: ChannelNightly, IgnoreVersion: "v0.1.0"}
	if err := SaveSettings(path, want); err != nil {
		t.Fatalf("save error: %v", err)
	}
	got, err := LoadSettings(path)
	if err != nil {
		t.Fatalf("load error: %v", err)
	}
	if got.Channel != want.Channel || got.IgnoreVersion != want.IgnoreVersion {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestLoadSettingsRetiresAmbiguousPrereleaseChannel(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte(`{"channel":"prerelease"}`), 0644); err != nil {
		t.Fatal(err)
	}
	s, err := LoadSettings(path)
	if err != nil {
		t.Fatal(err)
	}
	if s.Channel != ChannelStable {
		t.Fatalf("channel=%s, want fail-closed stable", s.Channel)
	}
}

func TestLoadSettingsEmptyChannelDefaultsToStable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte(`{"ignoreVersion":"x"}`), 0644); err != nil {
		t.Fatal(err)
	}
	s, err := LoadSettings(path)
	if err != nil {
		t.Fatalf("load error: %v", err)
	}
	if s.Channel != ChannelStable {
		t.Fatalf("channel=%s, want stable", s.Channel)
	}
}

func TestLoadSettingsRecoversFromAFileThatDoesNotParse(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	// Escritura truncada: lo que deja un corte de luz a mitad de guardado.
	if err := os.WriteFile(path, []byte(`{"channel":"nightly","lastCh`), 0644); err != nil {
		t.Fatal(err)
	}

	s, err := LoadSettings(path)
	if err != nil {
		t.Fatalf("un fichero ilegible dejaba el updater sin comprobar nunca mas: %v", err)
	}
	if s.Channel != ChannelStable {
		t.Fatalf("channel=%s, se esperaban los valores por defecto", s.Channel)
	}
	if _, err := os.Stat(path + ".corrupt"); err != nil {
		t.Fatalf("el fichero ilegible debe conservarse aparte para poder mirarlo: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("el fichero ilegible no puede quedarse en su sitio: el siguiente arranque volveria a tropezar")
	}
}

func TestSaveSettingsNeverLeavesAHalfWrittenFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")
	if err := SaveSettings(path, &Settings{Channel: ChannelStable}); err != nil {
		t.Fatalf("save: %v", err)
	}
	// Un guardado mas largo sobre el mismo fichero: si escribiera en su sitio,
	// un corte a mitad lo dejaria truncado.
	long := &Settings{Channel: ChannelNightly, IgnoreVersion: strings.Repeat("v0.1.0.7-nightly.", 40)}
	if err := SaveSettings(path, long); err != nil {
		t.Fatalf("save largo: %v", err)
	}

	got, err := LoadSettings(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if got.IgnoreVersion != long.IgnoreVersion {
		t.Fatal("el contenido guardado no coincide")
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() != "settings.json" {
			t.Fatalf("quedo basura junto al fichero: %s", entry.Name())
		}
	}
}

func TestSaveSettingsLeavesNoTemporaryWhenTheTargetIsADirectory(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")
	// Un directorio con el nombre del fichero hace fallar el rename final.
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatal(err)
	}
	if err := SaveSettings(path, &Settings{Channel: ChannelStable}); err == nil {
		t.Fatal("guardar sobre un directorio deberia fallar")
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("un guardado fallido dejo temporales detras: %d entradas", len(entries))
	}
}
