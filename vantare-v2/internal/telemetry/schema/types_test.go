package schema

import "testing"

func TestUnitUnknownAndUnsupportedAreExplicit(t *testing.T) {
	t.Parallel()

	if UnitUnknown == UnitUnsupported {
		t.Fatal("unknown and unsupported units must be distinct")
	}
	if UnitUnknown.Known() {
		t.Fatal("unknown unit must not report itself as known")
	}
	if !UnitUnsupported.Known() || UnitUnsupported.Supported() {
		t.Fatal("unsupported unit must be known but unsupported")
	}
}

func TestRangeValidation(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		range_  Range
		wantErr bool
	}{
		{name: "unknown", range_: UnknownRange()},
		{name: "unsupported", range_: UnsupportedRange()},
		{name: "closed", range_: ClosedRange(0, 1)},
		{name: "closed inverted", range_: ClosedRange(1, 0), wantErr: true},
		{name: "invalid kind", range_: Range{Kind: RangeKind(255)}, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.range_.Validate()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestDomainUnknownSupportsForwardCompatibility(t *testing.T) {
	t.Parallel()

	if DomainUnknown != 0 {
		t.Fatalf("DomainUnknown = %d, want zero", DomainUnknown)
	}
	if Domain(255).Known() {
		t.Fatal("unrecognized domain must remain representable without becoming known")
	}
}
