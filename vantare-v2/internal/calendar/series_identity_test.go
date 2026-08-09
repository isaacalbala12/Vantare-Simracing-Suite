package calendar

import "testing"

func TestCanonicalSeriesIDSurvivesRenames(t *testing.T) {
	// The real renames between two consecutive published schedules.
	cases := []struct {
		tier   string
		before string
		after  string
	}{
		{"intermediate", "LMGT3 Sprint", "LMGT3 Sprint Cup"},
		{"intermediate", "ELMS Sprint", "ELMS Sprint Trophy"},
	}
	for _, c := range cases {
		before, knownBefore := CanonicalSeriesID(c.tier, c.before)
		after, knownAfter := CanonicalSeriesID(c.tier, c.after)
		if !knownBefore || !knownAfter {
			t.Fatalf("%q/%q should both be registered", c.before, c.after)
		}
		if before != after {
			t.Fatalf("%q -> %q, %q -> %q: a rename must keep the ID", c.before, before, c.after, after)
		}
	}
}

func TestCanonicalSeriesIDIgnoresPunctuationAndCase(t *testing.T) {
	a, _ := CanonicalSeriesID("advanced", "WEC-Xperience")
	b, _ := CanonicalSeriesID("advanced", "wec xperience")
	if a != b {
		t.Fatalf("%q != %q", a, b)
	}
}

func TestCanonicalSeriesIDKeepsTiersApart(t *testing.T) {
	beginner, _ := CanonicalSeriesID("beginner", "LMGT3 Fixed")
	advanced, _ := CanonicalSeriesID("advanced", "LMGT3 Fixed")
	if beginner == advanced {
		t.Fatal("the same series name in two tiers must not share an ID")
	}
}

func TestCanonicalSeriesIDFallsBackForNewSeries(t *testing.T) {
	id, known := CanonicalSeriesID("advanced", "Some Brand New Cup")
	if known {
		t.Fatal("an unregistered name must report as unknown")
	}
	if id != "advanced-some-brand-new-cup" {
		t.Fatalf("id=%q", id)
	}
}

func TestCanonicalSeriesRegistryHasNoDuplicateAliases(t *testing.T) {
	seen := map[string]string{}
	for canonical, aliases := range canonicalSeries {
		for _, alias := range aliases {
			key := normaliseSeriesName(alias)
			if other, dup := seen[key]; dup {
				t.Fatalf("alias %q claimed by both %q and %q", alias, other, canonical)
			}
			seen[key] = canonical
		}
	}
}

func TestImportUsesCanonicalIDs(t *testing.T) {
	sched := importFixture(t)

	// "LMGT3 Sprint Cup" and "ELMS Sprint Trophy" in the published text must
	// land on the IDs the calendar already stores from the previous schedule.
	seriesByID(t, sched, "intermediate-lmgt3-sprint")
	seriesByID(t, sched, "intermediate-elms-sprint")
	seriesByID(t, sched, "weekly-le-mans-24h-scaled")
}
