package duckdbadapter

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadRuntimeManifest(t *testing.T) {
	directory := t.TempDir()
	writeRuntimeFixture(t, directory)
	runtime, err := LoadRuntime(runtimeFixtureTrust(t, directory))
	if err != nil {
		t.Fatalf("LoadRuntime() error = %v", err)
	}
	if runtime.HelperPath != filepath.Join(directory, helperFilename) || !filepath.IsAbs(runtime.HelperPath) {
		t.Fatalf("helper path = %q", runtime.HelperPath)
	}
}

func TestLoadRuntimeRejectsInvalidOrTamperedUnit(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*testing.T, string)
	}{
		{name: "relative manifest", mutate: func(t *testing.T, directory string) {
			t.Chdir(directory)
		}},
		{name: "missing helper", mutate: func(t *testing.T, directory string) {
			if err := os.Remove(filepath.Join(directory, helperFilename)); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "tampered dll", mutate: func(t *testing.T, directory string) {
			if err := os.WriteFile(filepath.Join(directory, dllFilename), []byte("tampered"), 0o600); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "unknown manifest field", mutate: func(t *testing.T, directory string) {
			path := filepath.Join(directory, manifestFilename)
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			data = append(data[:len(data)-1], []byte(`,"sql":"select 1"}`)...)
			if err := os.WriteFile(path, data, 0o600); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "incompatible protocol", mutate: func(t *testing.T, directory string) {
			manifest := runtimeFixtureManifest(t, directory)
			manifest.ProtocolVersion++
			writeManifest(t, directory, manifest)
		}},
		{name: "coordinated bundle substitution", mutate: func(t *testing.T, directory string) {
			if err := os.WriteFile(filepath.Join(directory, helperFilename), []byte("attacker helper"), 0o600); err != nil {
				t.Fatal(err)
			}
			writeManifest(t, directory, runtimeFixtureManifest(t, directory))
		}},
		{name: "unmanifested dll", mutate: func(t *testing.T, directory string) {
			if err := os.WriteFile(filepath.Join(directory, "vcruntime140.dll"), []byte("untrusted dependency"), 0o600); err != nil {
				t.Fatal(err)
			}
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			directory := t.TempDir()
			writeRuntimeFixture(t, directory)
			trust := runtimeFixtureTrust(t, directory)
			test.mutate(t, directory)
			if test.name == "relative manifest" {
				trust.Directory = "."
			}
			if _, err := LoadRuntime(trust); !errors.Is(err, ErrRuntimeUnavailable) {
				t.Fatalf("LoadRuntime() error = %v, want ErrRuntimeUnavailable", err)
			}
		})
	}
}

func TestLoadRuntimeWithFallbackUsesOnlyIndependentlyTrustedBundle(t *testing.T) {
	primaryDirectory := t.TempDir()
	fallbackDirectory := t.TempDir()
	writeRuntimeFixture(t, primaryDirectory)
	writeRuntimeFixture(t, fallbackDirectory)
	primaryTrust := runtimeFixtureTrust(t, primaryDirectory)
	fallbackTrust := runtimeFixtureTrust(t, fallbackDirectory)
	if err := os.WriteFile(filepath.Join(primaryDirectory, helperFilename), []byte("broken update"), 0o600); err != nil {
		t.Fatal(err)
	}
	runtimeFiles, err := LoadRuntimeWithFallback(primaryTrust, fallbackTrust)
	if err != nil {
		t.Fatalf("LoadRuntimeWithFallback() error = %v", err)
	}
	if runtimeFiles.Directory != fallbackDirectory {
		t.Fatalf("selected directory = %q, want trusted fallback %q", runtimeFiles.Directory, fallbackDirectory)
	}
	if err := os.WriteFile(filepath.Join(fallbackDirectory, dllFilename), []byte("broken fallback"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadRuntimeWithFallback(primaryTrust, fallbackTrust); !errors.Is(err, ErrRuntimeUnavailable) {
		t.Fatalf("both invalid error = %v, want ErrRuntimeUnavailable", err)
	}
}

func runtimeFixtureTrust(t *testing.T, directory string) TrustedRuntime {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(directory, manifestFilename))
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(data)
	return TrustedRuntime{Directory: directory, ManifestSHA256: hex.EncodeToString(sum[:])}
}

func writeRuntimeFixture(t *testing.T, directory string) {
	t.Helper()
	files := map[string][]byte{
		helperFilename:  []byte("synthetic helper"),
		dllFilename:     []byte("synthetic dll"),
		noticesFilename: []byte("synthetic notices"),
		sbomFilename:    []byte(`{"synthetic":true}`),
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(directory, name), content, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	writeManifest(t, directory, runtimeFixtureManifest(t, directory))
}

func runtimeFixtureManifest(t *testing.T, directory string) RuntimeManifest {
	t.Helper()
	manifest := expectedManifest()
	for _, name := range []string{helperFilename, dllFilename, noticesFilename, sbomFilename} {
		data, err := os.ReadFile(filepath.Join(directory, name))
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(data)
		manifest.Files = append(manifest.Files, RuntimeFile{Name: name, Size: int64(len(data)), SHA256: hex.EncodeToString(sum[:])})
	}
	return manifest
}

func writeManifest(t *testing.T, directory string, manifest RuntimeManifest) {
	t.Helper()
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, manifestFilename), data, 0o600); err != nil {
		t.Fatal(err)
	}
}
