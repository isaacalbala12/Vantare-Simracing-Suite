package storagebench

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/strategy/repository"
	"github.com/vantare/overlays/v2/pkg/config"
)

func BenchmarkSettingsLoad(b *testing.B) {
	path := filepath.Join(b.TempDir(), "settings.json")
	data, err := json.Marshal(app.DefaultAppSettings())
	if err != nil {
		b.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		b.Fatal(err)
	}
	service := app.NewSettingsService(path, nil, nil)
	b.ReportAllocs()
	b.SetBytes(int64(len(data)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := service.Load(); err != nil {
			b.Fatal(err)
		}
	}
}
func BenchmarkProfileLoad(b *testing.B) {
	path := "../../../testdata/bench/huella-endurance-3.json"
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		if _, err := (config.ProfileDocumentStore{}).LoadV4(path); err != nil {
			b.Fatal(err)
		}
	}
}
func BenchmarkStrategyVersionGate(b *testing.B) {
	data, err := os.ReadFile("../../../internal/strategy/repository/testdata/repository-v2.golden.json")
	if err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	b.SetBytes(int64(len(data)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, _, err := repository.MigrateRepositoryJSON(data); err != nil {
			b.Fatal(err)
		}
	}
}
