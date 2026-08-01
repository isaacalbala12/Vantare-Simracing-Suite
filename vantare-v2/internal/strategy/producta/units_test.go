package producta

import (
	"math"
	"testing"
)

func TestLitresGallonsRoundTrip(t *testing.T) {
	litres := 42.75
	gallons, err := LitresToGallons(litres)
	if err != nil {
		t.Fatalf("litres to gallons: %v", err)
	}
	converted, err := GallonsToLitres(gallons)
	if err != nil {
		t.Fatalf("gallons to litres: %v", err)
	}
	if math.Abs(converted-litres) > 1e-9 {
		t.Fatalf("round-trip drifted: want %.12f, got %.12f", litres, converted)
	}
}

func TestFormatLapTimeUsesMinutesSecondsAndMilliseconds(t *testing.T) {
	got, err := FormatLapTime(83.4567)
	if err != nil {
		t.Fatalf("format lap time: %v", err)
	}
	if got != "01:23.457" {
		t.Fatalf("unexpected lap time: %q", got)
	}
}

func TestRoundRecommendedAmountUsesRequestedPrecision(t *testing.T) {
	got, err := RoundRecommendedAmount(12.3456, 2)
	if err != nil {
		t.Fatalf("round amount: %v", err)
	}
	if got != 12.35 {
		t.Fatalf("unexpected rounded amount: %.4f", got)
	}
}

func TestUnitsRejectNonFiniteValues(t *testing.T) {
	tests := []struct {
		name string
		fn   func(float64) error
	}{
		{name: "litres to gallons", fn: func(value float64) error { _, err := LitresToGallons(value); return err }},
		{name: "gallons to litres", fn: func(value float64) error { _, err := GallonsToLitres(value); return err }},
		{name: "lap time", fn: func(value float64) error { _, err := FormatLapTime(value); return err }},
		{name: "recommended amount", fn: func(value float64) error { _, err := RoundRecommendedAmount(value, 2); return err }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			for _, value := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
				if err := test.fn(value); err == nil {
					t.Fatalf("expected error for %v", value)
				}
			}
		})
	}
}
