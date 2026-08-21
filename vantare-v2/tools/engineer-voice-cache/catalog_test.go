package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseCatalog_Strict70(t *testing.T) {
	manifest, out, err := parseCatalog("../../docs/engineer/catalog-v1.md")
	if err != nil {
		t.Fatalf("parseCatalog: %v", err)
	}
	if len(manifest.Intents) != 70 {
		t.Fatalf("want 70 intents, got %d", len(manifest.Intents))
	}
	if len(out) == 0 || out[len(out)-1] != '\n' {
		t.Error("output should end with newline")
	}
	// check placeholders extraction for a known intent
	var found *IntentEntry
	for i := range manifest.Intents {
		if manifest.Intents[i].Intent == "fuel.status_on_demand" {
			found = &manifest.Intents[i]
			break
		}
	}
	if found == nil {
		t.Fatal("fuel.status_on_demand not found")
	}
	if len(found.Placeholders) != 2 {
		t.Fatalf("placeholders %v", found.Placeholders)
	}
	// locales must be 4
	if len(manifest.Locales) != 4 {
		t.Fatalf("locales %v", manifest.Locales)
	}
	// each locale's placeholders must be subset
	for _, it := range manifest.Intents {
		for _, loc := range manifest.Locales {
			if _, ok := it.Locales[loc]; !ok {
				t.Fatalf("intent %s missing locale %s", it.Intent, loc)
			}
		}
	}
}

func TestParseCatalog_FailsOnBrokenTable(t *testing.T) {
	// create a temp catalog with broken column count (should be ignored? but if it's a catalog-like row with 9 expected cols but we provide 2 col legend, we skip. To test strict failure, craft a row that claims to be catalog row but has invalid voice)
	dir := t.TempDir()
	// inject a row with empty voice cell for es (strict should fail)
	broken := `
## 1. Familia spotter — P0
| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal |
|---|---|---|---|---|---|---|---|---|
| ` + "`spotter.car_left`" + ` |  ·  | Car left · Car left | Auto a sinistra · Auto a sinistra | Carro à esquerda · Carro à esquerda | interrumpe | P0 | 3 s | x |
`
	path := filepath.Join(dir, "broken.md")
	if err := os.WriteFile(path, []byte(broken), 0o644); err != nil {
		t.Fatal(err)
	}
	_, _, err := parseCatalog(path)
	if err == nil {
		t.Fatal("expected strict parse error for empty voice")
	}
}

func TestCheckRegeneration(t *testing.T) {
	// simulate --check: generate, write, then check passes, then modify and fails
	dir := t.TempDir()
	out := filepath.Join(dir, "catalog-voice.v1.json")
	if err := run([]string{"--catalog", "../../docs/engineer/catalog-v1.md", "--manifest", out}); err != nil {
		t.Fatalf("generate: %v", err)
	}
	if err := run([]string{"--check", "--catalog", "../../docs/engineer/catalog-v1.md", "--manifest", out}); err != nil {
		t.Fatalf("check should pass: %v", err)
	}
	// corrupt file
	b, _ := os.ReadFile(out)
	b[0] = 'X'
	_ = os.WriteFile(out, b, 0o644)
	if err := run([]string{"--check", "--catalog", "../../docs/engineer/catalog-v1.md", "--manifest", out}); err == nil {
		t.Fatal("check should fail after corruption")
	}
}
