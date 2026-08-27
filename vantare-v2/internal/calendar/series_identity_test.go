package calendar

import "testing"

func TestTelemetryVenueIdentityUsesDeclaredCalendarNames(t *testing.T) {
	cases := map[string]string{
		"Bahrain (Outer)":               "Bahrain International Circuit",
		"Bahrain (WEC)":                 "Bahrain International Circuit",
		"Barcelona (ELMS)":              "Circuit de Barcelona",
		"COTA (WEC)":                    "Circuit of the Americas",
		"Daytona (RC)":                  "Daytona International Speedway",
		"Fuji (WEC)":                    "Fuji Speedway",
		"Laguna Seca (RC)":              "WeatherTech Raceway Laguna Seca",
		"Le Mans (WEC)":                 "Circuit de la Sarthe",
		"Portimao (ELMS)":               "Algarve International Circuit",
		"Portimao (WEC)":                "Algarve International Circuit",
		"Qatar (Short)":                 "Lusail International Circuit",
		"Sebring (WEC)":                 "Sebring International Raceway",
		"Spa (WEC)":                     "Circuit de Spa-Francorchamps",
		"Spa-Francorchamps (ELMS)":      "Circuit de Spa-Francorchamps",
		"Spa-Francorchamps (Endurance)": "Circuit de Spa-Francorchamps",
		"Silverstone (ELMS)":            "Silverstone Circuit",
	}
	for calendarTrack, want := range cases {
		got, ok := TelemetryTrackName(calendarTrack)
		if !ok || got != want {
			t.Errorf("TelemetryTrackName(%q)=(%q,%v), want (%q,true)", calendarTrack, got, ok, want)
		}
	}
	if got, ok := TelemetryTrackName("Spa"); ok || got != "" {
		t.Fatalf("undeclared venue resolved as (%q,%v)", got, ok)
	}
}

func TestTelemetryClassIdentityUsesDeclaredCalendarNames(t *testing.T) {
	cases := map[string]string{
		"Hypercar": "Hyper",
		"LMGT3":    "GT3",
		"LMGTE Am": "GTE",
		"LMP2":     "LMP2_ELMS",
		"LMP3":     "LMP3",
	}
	for calendarClass, want := range cases {
		got, ok := TelemetryClassName(calendarClass)
		if !ok || got != want {
			t.Errorf("TelemetryClassName(%q)=(%q,%v), want (%q,true)", calendarClass, got, ok, want)
		}
	}
	if got, ok := TelemetryClassName("LMH"); ok || got != "" {
		t.Fatalf("undeclared class resolved as (%q,%v)", got, ok)
	}
}

func TestWeeklyScheduleEveryVenueAndClassHasTelemetryIdentity(t *testing.T) {
	sched, err := LoadWeeklySchedule()
	if err != nil {
		t.Fatalf("LoadWeeklySchedule: %v", err)
	}
	venues := map[string]struct{}{}
	for _, series := range sched.Series {
		venues[series.Track] = struct{}{}
		if series.TelemetryTrackName == "" {
			t.Errorf("series %q: calendar venue %q has no declared telemetry identity", series.ID, series.Track)
		}
		for _, class := range series.Classes {
			if class.TelemetryClassName == "" {
				t.Errorf("series %q: calendar class %q has no declared telemetry identity", series.ID, class.Name)
			}
		}
	}
	if len(venues) != 10 {
		t.Fatalf("weekly schedule has %d venues, want 10", len(venues))
	}
}

func TestResolveTelemetryIdentitiesRejectsValuesSuppliedBySchedule(t *testing.T) {
	schedule := OfficialSchedule{Series: []RaceSeries{{
		Track:              "Unknown (WEC)",
		TelemetryTrackName: "untrusted track",
		Classes: []VehicleClass{{
			Name:               "Unknown class",
			TelemetryClassName: "untrusted class",
		}},
	}}}

	resolveTelemetryIdentities(&schedule)
	if schedule.Series[0].TelemetryTrackName != "" {
		t.Fatalf("unknown venue kept schedule-supplied identity %q", schedule.Series[0].TelemetryTrackName)
	}
	if schedule.Series[0].Classes[0].TelemetryClassName != "" {
		t.Fatalf("unknown class kept schedule-supplied identity %q", schedule.Series[0].Classes[0].TelemetryClassName)
	}
}

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
