package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	// default paths relative to repo root (cwd expected to be repo root, but also handle being invoked from anywhere)
	catalogPath := "docs/engineer/catalog-v1.md"
	manifestPath := "tools/engineer-voice-cache/catalog-voice.v1.json"
	modelsLockPath := "tools/engineer-voice-cache/voice-models.lock.json"
	cacheLockPath := "tools/engineer-voice-cache/voice-cache.lock.json"
	cacheRoot := ""
	provider := "mock"
	kokoroURL := ""
	check := false
	synth := false

	// simple flag parsing: allow --catalog, --manifest, --models-lock, --cache-lock, --cache-root, --provider, --kokoro-url, --check, --synth
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch a {
		case "--catalog":
			if i+1 >= len(args) {
				return fmt.Errorf("--catalog requires value")
			}
			i++
			catalogPath = args[i]
		case "--manifest":
			if i+1 >= len(args) {
				return fmt.Errorf("--manifest requires value")
			}
			i++
			manifestPath = args[i]
		case "--models-lock":
			if i+1 >= len(args) {
				return fmt.Errorf("--models-lock requires value")
			}
			i++
			modelsLockPath = args[i]
		case "--cache-lock":
			if i+1 >= len(args) {
				return fmt.Errorf("--cache-lock requires value")
			}
			i++
			cacheLockPath = args[i]
		case "--cache-root":
			if i+1 >= len(args) {
				return fmt.Errorf("--cache-root requires value")
			}
			i++
			cacheRoot = args[i]
		case "--provider":
			if i+1 >= len(args) {
				return fmt.Errorf("--provider requires value")
			}
			i++
			provider = args[i]
		case "--kokoro-url":
			if i+1 >= len(args) {
				return fmt.Errorf("--kokoro-url requires value")
			}
			i++
			kokoroURL = args[i]
		case "--check":
			check = true
		case "--synth":
			synth = true
		case "--help", "-h":
			printUsage()
			return nil
		default:
			return fmt.Errorf("unknown arg %q (see --help)", a)
		}
	}

	if synth {
		if _, err := os.Stat(manifestPath); err != nil {
			return fmt.Errorf("manifest not found at %s: run without --synth first to generate it", manifestPath)
		}
		return synthManifest(manifestPath, cacheRoot, provider, modelsLockPath, cacheLockPath, kokoroURL)
	}

	// manifest generation (default)
	_, outBytes, err := parseCatalog(catalogPath)
	if err != nil {
		return err
	}
	if check {
		existing, err := os.ReadFile(manifestPath)
		if err != nil {
			return fmt.Errorf("check failed: cannot read %s: %w", manifestPath, err)
		}
		if !bytes.Equal(existing, outBytes) {
			// write to temp for diff hint
			tmp := manifestPath + ".tmp"
			_ = os.WriteFile(tmp, outBytes, 0o644)
			return fmt.Errorf("check failed: %s differs from generated output (byte-to-byte). Run without --check to regenerate, then commit. Diff: compare %s vs %s", manifestPath, manifestPath, tmp)
		}
		fmt.Printf("check ok: %s matches catalog %s\n", manifestPath, catalogPath)
		return nil
	}
	// ensure dir
	if err := os.MkdirAll(filepath.Dir(manifestPath), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(manifestPath, outBytes, 0o644); err != nil {
		return err
	}
	fmt.Printf("manifest written: %s (%d bytes, source %s)\n", manifestPath, len(outBytes), catalogPath)
	return nil
}

func printUsage() {
	fmt.Print(`voice-cache - pipeline precacheo Kokoro (ISA-716)

Uso:
  # Generar manifiesto desde el catálogo
  go run ./tools/engineer-voice-cache --catalog docs/engineer/catalog-v1.md --manifest tools/engineer-voice-cache/catalog-voice.v1.json

  # Verificar regeneración byte-a-byte (CI gate)
  go run ./tools/engineer-voice-cache --check --catalog docs/engineer/catalog-v1.md --manifest tools/engineer-voice-cache/catalog-voice.v1.json

  # Sintetizar caché (mock para smoke, kokoro para real)
  go run ./tools/engineer-voice-cache --synth --manifest tools/engineer-voice-cache/catalog-voice.v1.json --cache-root <dir> --provider mock
  go run ./tools/engineer-voice-cache --synth --manifest tools/engineer-voice-cache/catalog-voice.v1.json --cache-root %APPDATA%\Vantare\Ingeniero\tts-cache --provider kokoro --kokoro-url http://localhost:8880/v1/audio/speech

Flags:
  --catalog     Ruta al catalog-v1.md
  --manifest    Ruta de salida del manifiesto JSON
  --check       Compara byte-a-byte sin escribir
  --synth       Sintetiza al caché (requiere manifiesto existente)
  --cache-root  Raíz de caché (default: tts.DefaultCacheRoot())
  --provider    mock|kokoro (default mock)
  --kokoro-url  URL REST Kokoro
  --models-lock Ruta voice-models.lock.json
  --cache-lock  Ruta voice-cache.lock.json
`)
}
