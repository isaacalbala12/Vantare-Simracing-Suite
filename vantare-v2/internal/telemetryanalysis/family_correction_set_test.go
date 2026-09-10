package telemetryanalysis

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestEmptyLapFamilySetStillRequiresAValidBase(t *testing.T) {
	_, original, _ := lapFamilyCorrectionExample(t)
	if _, err := PrepareLapFamilyCorrections(SourceAnalysisRef{}, original, nil); err == nil {
		t.Fatal("empty set bypassed base validation")
	}
}

func TestLapFamilySetAppliesOnlySelectedFamilyAndDetachesLaps(t *testing.T) {
	base, original, request := lapFamilyCorrectionExample(t)
	prepared, err := PrepareLapFamilyCorrections(base, original, []LapFamilyUseCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	laps, err := ApplyLapFamilyCorrections(base, original, original, prepared)
	if err != nil {
		t.Fatal(err)
	}
	if familyIncluded(laps[0], FamilyCombinedStintPaceCurve) || !familyIncluded(laps[0], FamilyFuelConsumption) || !familyIncluded(laps[0], FamilyVirtualEnergyConsumption) || !familyIncluded(original.Laps[0], FamilyCombinedStintPaceCurve) {
		t.Fatal("family selection leaked or original mutated")
	}
	*laps[0].Start = laps[0].Start.Add(time.Hour)
	laps[0].FamilyUse[0].Included = false
	if !original.Laps[0].Start.Equal(request.Target.Start) || !familyIncluded(original.Laps[0], FamilyFuelConsumption) {
		t.Fatal("returned lap aliases original")
	}
}

func TestLapFamilySetRejectsOverlapButAllowsDifferentFamilies(t *testing.T) {
	base, original, request := lapFamilyCorrectionExample(t)
	if _, err := PrepareLapFamilyCorrections(base, original, []LapFamilyUseCorrection{request, request}); !errors.Is(err, ErrOverlappingCorrections) {
		t.Fatal("accepted duplicate target", err)
	}
	fuel := request
	fuel.Family, fuel.Expected = FamilyFuelConsumption, original.Laps[0].FamilyUse[0]
	first, err := PrepareLapFamilyCorrections(base, original, []LapFamilyUseCorrection{request, fuel})
	if err != nil {
		t.Fatal(err)
	}
	second, err := PrepareLapFamilyCorrections(base, original, []LapFamilyUseCorrection{fuel, request})
	if err != nil || !reflect.DeepEqual(first, second) {
		t.Fatal("set order changed identity", err)
	}
	lap := original.Laps[0]
	lap.Number++
	start := lap.Start.Add(time.Second)
	lap.Start = &start
	original.Laps = append(original.Laps, lap)
	overlapping := request
	overlapping.Target = LapCorrectionTarget{Number: lap.Number, Start: start, End: lap.End}
	if _, err := PrepareLapFamilyCorrections(base, original, []LapFamilyUseCorrection{request, overlapping}); !errors.Is(err, ErrOverlappingCorrections) {
		t.Fatal("accepted overlapping intervals for same family", err)
	}
}

func TestLapFamilySetRejectsChangedEffectiveTargetAndIntegrity(t *testing.T) {
	base, original, request := lapFamilyCorrectionExample(t)
	prepared, err := PrepareLapFamilyCorrections(base, original, []LapFamilyUseCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	effective := original
	effective.Laps = cloneFamilyCorrectionLaps(original.Laps)
	effective.Laps[0].End = effective.Laps[0].End.Add(time.Second)
	if got, err := ApplyLapFamilyCorrections(base, original, effective, prepared); !errors.Is(err, ErrCorrectionTarget) || got != nil {
		t.Fatal("silently reanchored correction", err)
	}
	prepared[0].Corrected.Included = true
	if got, err := ApplyLapFamilyCorrections(base, original, original, prepared); !errors.Is(err, ErrInvalidCorrection) || got != nil {
		t.Fatal("accepted tampered prepared set", err)
	}
}

func TestLapFamilySetRechecksHardIntegrityAfterScalarAnalysis(t *testing.T) {
	base, original, request := lapFamilyCorrectionExample(t)
	request.Included = true
	prepared, err := PrepareLapFamilyCorrections(base, original, []LapFamilyUseCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	effective := original
	effective.Laps = cloneFamilyCorrectionLaps(original.Laps)
	effective.Laps[0].Complete = false
	if got, err := ApplyLapFamilyCorrections(base, original, effective, prepared); !errors.Is(err, ErrCorrectionValue) || got != nil {
		t.Fatal("included lap made incomplete by another correction", err)
	}
	if _, err := PrepareLapFamilyCorrections(base, original, make([]LapFamilyUseCorrection, MaxSampleCorrections+1)); !errors.Is(err, ErrInvalidCorrection) {
		t.Fatal("ignored correction quota", err)
	}
}

func TestLapFamilySetDoesNotConfuseRepeatedLapNumbers(t *testing.T) {
	base, original, request := lapFamilyCorrectionExample(t)
	lap := original.Laps[0]
	start := lap.End
	lap.Start, lap.End = &start, start.Add(90*time.Second)
	original.Laps = append(original.Laps, lap)
	prepared, err := PrepareLapFamilyCorrections(base, original, []LapFamilyUseCorrection{request})
	if err != nil {
		t.Fatal(err)
	}
	laps, err := ApplyLapFamilyCorrections(base, original, original, prepared)
	if err != nil || familyIncluded(laps[0], request.Family) || !familyIncluded(laps[1], request.Family) {
		t.Fatal("number alone selected a different lap", err)
	}
}
