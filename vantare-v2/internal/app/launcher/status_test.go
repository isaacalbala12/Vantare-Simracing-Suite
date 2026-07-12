package launcher

import "testing"

func TestDeriveAvailability(t *testing.T) {
	tests := []struct {
		name string
		in   DetectionEvidence
		want Availability
	}{
		{"catalog only", DetectionEvidence{Catalogued: true}, Availability{Catalogued: true}},
		{"registry without executable", DetectionEvidence{Catalogued: true, Found: true}, Availability{Catalogued: true, Found: true}},
		{"valid executable", DetectionEvidence{Catalogued: true, Found: true, ExecutableExists: true}, Availability{Catalogued: true, Found: true, Installed: true, Launchable: true}},
		{"steam installed", DetectionEvidence{Catalogued: true, Found: true, SteamInstalled: true, SteamAppID: 2399420}, Availability{Catalogued: true, Found: true, Installed: true, Launchable: true}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := DeriveAvailability(tt.in); got != tt.want {
				t.Fatalf("got %+v want %+v", got, tt.want)
			}
		})
	}
}
