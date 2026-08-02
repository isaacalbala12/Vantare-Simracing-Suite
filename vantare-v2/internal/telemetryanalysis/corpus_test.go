package telemetryanalysis

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestSanitizedCorpusManifest(t *testing.T) {
	t.Parallel()

	root := filepath.Join("testdata", "corpus")
	manifestBytes, err := os.ReadFile(filepath.Join(root, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest Manifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	if err := ValidateManifest(manifest); err != nil {
		t.Fatalf("fixture does not satisfy production manifest policy: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(root, "synthetic-lmu-session.duckdb"))
	if err != nil {
		t.Fatal(err)
	}

	contentHash := sha256.Sum256(content)
	gotContentHash := hex.EncodeToString(contentHash[:])
	dedupeHash := sha256.Sum256([]byte(gotContentHash + ":" + strconv.Itoa(len(content))))

	if manifest.Version != ManifestVersion ||
		manifest.ContentSHA256 != gotContentHash ||
		manifest.DedupeKey != hex.EncodeToString(dedupeHash[:]) ||
		manifest.Size != int64(len(content)) {
		t.Fatalf("corpus manifest does not match synthetic content: %+v", manifest)
	}
	if manifest.Provenance.Kind != ProvenanceSynthetic || manifest.Provenance.EvidenceID == "" {
		t.Fatalf("corpus provenance is incomplete: %+v", manifest.Provenance)
	}
	serialized := string(manifestBytes)
	for _, forbidden := range []string{`C:\`, "/Users/", "SteamID", "driver_name", "player_name"} {
		if strings.Contains(serialized, forbidden) {
			t.Fatalf("corpus manifest contains forbidden personal marker %q", forbidden)
		}
	}
}
