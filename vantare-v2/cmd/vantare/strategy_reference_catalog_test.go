package main

import (
	"context"
	strategycatalog "github.com/vantare/overlays/v2/internal/strategy/catalog"
	"testing"
	"time"
)

func TestProductionReferenceCatalogRejectsTestFixtureAndCache(t *testing.T) {
	for _, cached := range []bool{false, true} {
		t.Run(map[bool]string{false: "fresh", true: "test_cache"}[cached], func(t *testing.T) {
			options := strategyReferenceCatalogOptions(t.TempDir())
			// Keep the TEST envelope valid: rejection must come from trust, not expiry.
			options.Now = func() time.Time { return time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC) }
			if cached {
				seed := options
				seed.Fixture = strategycatalog.FixtureSignedV1
				seed.TrustedKeys = strategycatalog.FixtureTrustedKeys()
				first, err := strategycatalog.NewConsumer(seed).Load(context.Background())
				if err != nil || first.Source != strategycatalog.SourceCandidate || len(first.Catalog.Combinations) == 0 {
					t.Fatalf("seed=%+v err=%v", first, err)
				}
			}
			if cached {
				options.Fixture = nil
			}
			result, err := strategycatalog.NewConsumer(options).Load(context.Background())
			if err != nil || result.Source != strategycatalog.SourceEmpty || len(result.Catalog.Combinations) != 0 {
				t.Fatalf("production accepted TEST: %+v err=%v", result, err)
			}
		})
	}
}
