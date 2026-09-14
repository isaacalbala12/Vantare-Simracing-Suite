package main

import "testing"

func TestGeneratedAliasesIncludeLMUShortNames(t *testing.T) {
	got := aliasesForTrack("Sebring International Raceway")
	if len(got) != 2 || got[0] != "Sebring International Raceway" || got[1] != "Sebring" {
		t.Fatalf("aliases = %q, want canonical and short names", got)
	}
}

func TestIdentifierIsStableKebabAscii(t *testing.T) {
	for name, want := range map[string]string{
		"Circuit de Barcelona":            "circuit-de-barcelona",
		"Autódromo José Carlos Pace":      "autodromo-jose-carlos-pace",
		"WeatherTech Raceway Laguna Seca": "weathertech-raceway-laguna-seca",
		"Circuit de Spa-Francorchamps":    "circuit-de-spa-francorchamps",
		"  spaced  out  ":                 "spaced-out",
	} {
		t.Run(name, func(t *testing.T) {
			if got := identifier(name); got != want {
				t.Fatalf("identifier(%q) = %q, want %q", name, got, want)
			}
		})
	}
}

func TestSessionNameExtractsTheCircuit(t *testing.T) {
	for name, want := range map[string]string{
		"Circuit de Barcelona_P_2026-06-28T11_54_55Z.duckdb": "Circuit de Barcelona",
		"Circuit de la Sarthe_R_2026-07-01T15_43_37Z.duckdb": "Circuit de la Sarthe",
		"Fuji Speedway_Q_2026-07-02T16_56_10Z.duckdb":        "Fuji Speedway",
	} {
		t.Run(name, func(t *testing.T) {
			match := sessionName.FindStringSubmatch(name)
			if match == nil {
				t.Fatal("no match")
			}
			if match[1] != want {
				t.Fatalf("track = %q, want %q", match[1], want)
			}
		})
	}
}

func TestSessionNameIgnoresUnrelatedFiles(t *testing.T) {
	for _, name := range []string{
		"Circuit de Barcelona_P_2026-06-28T11_54_55Z.duckdb.wal",
		"notes.txt",
		"session.duckdb",
	} {
		t.Run(name, func(t *testing.T) {
			if sessionName.MatchString(name) {
				t.Fatalf("%q was treated as a session", name)
			}
		})
	}
}
