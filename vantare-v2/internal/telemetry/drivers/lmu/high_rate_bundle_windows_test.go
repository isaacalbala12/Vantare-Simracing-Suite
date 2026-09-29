//go:build windows

package lmu

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const highRateBundleSHA256 = "c5b827ce1cfa558e732da934f11eb0f83f5dfb9e8a3c793f4d3f65ef8ca2a01c"

// This mandatory test keeps the accepted real input available to Windows CI.
// It streams the 1.17 GiB uncompressed corpus without extracting it or keeping
// frames in memory, and fails if the archive or any individual event changes.
func TestBundledLMUHighRateCorpus(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "testdata", "rust-port", "lmu47-high-rate-60s.tar.gz")
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	archiveHash := sha256.New()
	if _, err := io.Copy(archiveHash, file); err != nil {
		t.Fatal(err)
	}
	if hex.EncodeToString(archiveHash.Sum(nil)) != highRateBundleSHA256 {
		t.Fatal("bundled high-rate corpus SHA-256 mismatch")
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		t.Fatal(err)
	}
	zipped, err := gzip.NewReader(file)
	if err != nil {
		t.Fatal(err)
	}
	defer zipped.Close()
	reader := tar.NewReader(zipped)
	const prefix = "isa-1403-lmu-high-rate-final-20260929/"
	var manifest highRateManifest
	var byFile map[string]highRateEvent
	var checked int
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		if header.Name == prefix && header.Typeflag == tar.TypeDir {
			continue
		}
		if header.Typeflag != tar.TypeReg || !strings.HasPrefix(header.Name, prefix) || header.Size < 1 || header.Size > 2*1024*1024 {
			t.Fatalf("unexpected archive entry %q", header.Name)
		}
		name := strings.TrimPrefix(header.Name, prefix)
		payload, err := io.ReadAll(reader)
		if err != nil || int64(len(payload)) != header.Size {
			t.Fatalf("read archive entry %q: %v", name, err)
		}
		if name == "manifest.json" {
			if byFile != nil || checked != 0 || json.Unmarshal(payload, &manifest) != nil ||
				manifest.Schema != "vantare.lmu-temporal-high-rate.v1" || manifest.Build != "1.4.2.0" ||
				manifest.Vehicles != 47 || manifest.SHMTicks != 3600 || manifest.RESTReports != 239 || len(manifest.Events) != 3839 {
				t.Fatal("bundled high-rate manifest differs from audited capture")
			}
			byFile = make(map[string]highRateEvent, len(manifest.Events))
			for _, event := range manifest.Events {
				if _, duplicate := byFile[event.File]; duplicate {
					t.Fatal("duplicate event file in high-rate manifest")
				}
				byFile[event.File] = event
			}
			continue
		}
		if byFile == nil {
			t.Fatal("archive event precedes manifest")
		}
		event, ok := byFile[name]
		if !ok {
			t.Fatalf("unlisted or duplicate archive file %q", name)
		}
		fileHash := sha256.Sum256(payload)
		if hex.EncodeToString(fileHash[:]) != event.SHA256 {
			t.Fatalf("event %q SHA-256 mismatch", name)
		}
		switch event.Kind {
		case "shm":
			at, err := time.Parse(time.RFC3339Nano, event.AtUTC)
			if err != nil || len(payload) != ObjectOutSize {
				t.Fatalf("event %q time/size invalid", name)
			}
			observation, err := parseWithProfile(payload, at, compatibilityProfile{version: manifest.Build, supported: true})
			if err != nil || observation.Compatibility != CompatibilityKnown {
				t.Fatalf("event %q Go parser rejected SHM: %v", name, err)
			}
			count, ok := observation.VehicleCount.Value()
			if !ok || int(count) != manifest.Vehicles {
				t.Fatalf("event %q grid differs from manifest", name)
			}
		case "rest":
			var body struct {
				Schema string `json:"schema"`
			}
			if err := json.Unmarshal(payload, &body); err != nil || body.Schema != sanitizedRESTBodiesSchema {
				t.Fatalf("event %q REST body rejected: %v", name, err)
			}
		default:
			t.Fatalf("event %q has unknown kind %q", name, event.Kind)
		}
		delete(byFile, name)
		checked++
	}
	if byFile == nil || len(byFile) != 0 || checked != 3839 {
		t.Fatalf("bundled corpus incomplete: checked=%d missing=%d", checked, len(byFile))
	}
	t.Logf("bundled real LMU47 corpus audited: SHM=3600 REST=239 archive=%s", highRateBundleSHA256)
}
