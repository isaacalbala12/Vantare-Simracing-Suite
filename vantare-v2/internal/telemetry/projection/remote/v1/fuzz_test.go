package v1

import (
	"os"
	"path/filepath"
	"testing"
)

func FuzzDecode(f *testing.F) {
	for _, name := range []string{"active.golden.json", "minimal.golden.json"} {
		raw, err := os.ReadFile(filepath.Join("testdata", name))
		if err != nil {
			f.Fatalf("read seed %s: %v", name, err)
		}
		f.Add(raw)
	}
	f.Add([]byte(`{"version":1}`))
	f.Add([]byte(`not-json`))
	f.Fuzz(func(t *testing.T, raw []byte) {
		_, _ = Decode(raw)
	})
}
