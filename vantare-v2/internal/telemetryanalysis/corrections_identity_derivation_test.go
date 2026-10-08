package telemetryanalysis

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

// T12j4 — derivación con identidad canónica. La vista efectiva reclasifica la
// sesión y produce el tuple/ID del target persistido; las magnitudes físicas
// dependen de las decisiones escalares/familias/tipo/clima, no de la
// identidad. El SessionType original desconocido sigue rechazando la
// derivación global: no se fabrica una ClassifiedSession parcial.

func identityDerivationSnapshot(t *testing.T, base SourceAnalysisRef, inputs []SampleCorrectionInput, original LapValidityAnalysis, families []LapFamilyUseCorrection, session HistoricalSession, classes []ClassificationCorrection, target *CombinationIdentity) PreparedSampleCorrectionSnapshot {
	t.Helper()
	snapshot, err := PrepareCanonicalMixedCorrectionSnapshot(base, inputs, original, families, session, classes, target)
	if err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func TestIdentityDerivationResolvesEffectiveCombination(t *testing.T) {
	base, session, pages := classifiedDerivationFixture(t)
	caller := classifiedDerivationCaller(t, session)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	classes := []ClassificationCorrection{
		canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza"),
		classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify"),
	}
	snapshot := identityDerivationSnapshot(t, base, nil, LapValidityAnalysis{}, nil, session, classes, target)
	marshal := func(value any) string {
		data, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		return string(data)
	}
	beforeSession, beforePages, beforeCaller, beforeSnapshot := marshal(session), marshal(pages), marshal(caller), marshal(snapshot)
	derived, err := DeriveCorrectedSession(base, session, pages, caller, snapshot)
	if err != nil {
		t.Fatalf("derivación v4 válida rechazada: %v", err)
	}
	if derived.Base != base || derived.SnapshotID != snapshot.SnapshotID {
		t.Fatal("perdió la identidad de la revisión")
	}
	if !reflect.DeepEqual(derived.Classified.Combination, *target) || derived.Classified.Combination.ID != target.ID {
		t.Fatalf("combinación efectiva incorrecta: %+v", derived.Classified.Combination)
	}
	if derived.Classified.Type != SessionTypeQualify || derived.Classified.SessionID != session.ID {
		t.Fatalf("clasificación efectiva incorrecta: %+v", derived.Classified)
	}
	if derived.Consumption.CombinationID != target.ID || derived.Curves.CombinationID != target.ID || derived.Pit.CombinationID != target.ID {
		t.Fatal("los IDs derivados no portan la combinación efectiva")
	}
	if derived.Consumption.SessionID != session.ID || derived.Curves.SessionID != session.ID || derived.Pit.SessionID != session.ID {
		t.Fatal("perdió la identidad de sesión en las derivaciones")
	}
	if marshal(session) != beforeSession || marshal(pages) != beforePages || marshal(caller) != beforeCaller || marshal(snapshot) != beforeSnapshot {
		t.Fatal("la derivación mutó sus entradas")
	}
}

func TestIdentityDerivationKeepsPhysicalMagnitudes(t *testing.T) {
	base, session, pages := classifiedDerivationFixture(t)
	caller := classifiedDerivationCaller(t, session)
	original, err := AnalyzeLapValidity(session, pages)
	if err != nil {
		t.Fatal(err)
	}
	base.AnalysisVersion = original.ComputationVersion
	base.SegmentationDigest, err = correctionDigest("analysis.correction-segmentation.v1", original.Temporal)
	if err != nil {
		t.Fatal(err)
	}
	var scalarInput *SampleCorrectionInput
outer:
	for c := range session.Channels {
		channel := &session.Channels[c]
		if channel.SourceName != "Lap Time" {
			continue
		}
		channel.Unit = HistoricalUnit{Symbol: "s", Quality: QualityValid}
		for _, page := range pages {
			if page.ChannelID != channel.ID {
				continue
			}
			for _, sample := range page.Samples {
				if sample.Values[0].Scalar.Number <= 0 {
					continue
				}
				replacement := sample.Values[0].Scalar
				replacement.Number++
				scalarInput = &SampleCorrectionInput{Channel: *channel, Sample: sample, Request: SampleValueCorrection{Base: base, Target: SampleCorrectionTarget{ChannelID: channel.ID, Column: sample.Values[0].Column, SampleIndex: sample.Index}, Unit: channel.Unit, Expected: sample.Values[0], Replacement: replacement, Reason: "controlled one second test"}}
				break outer
			}
		}
	}
	if scalarInput == nil {
		t.Fatal("fixture sin objetivo de Lap Time")
	}
	var familyRequest *LapFamilyUseCorrection
	for _, lap := range original.Laps {
		if lap.Start == nil || !lap.Complete || !familyIncluded(lap, FamilyCombinedStintPaceCurve) {
			continue
		}
		familyRequest = &LapFamilyUseCorrection{Base: base, Target: LapCorrectionTarget{Number: lap.Number, Start: *lap.Start, End: lap.End}, Family: FamilyCombinedStintPaceCurve, Included: false, Reason: "controlled pace exclusion"}
		for _, use := range lap.FamilyUse {
			if use.Family == familyRequest.Family {
				familyRequest.Expected = use
			}
		}
		break
	}
	if familyRequest == nil {
		t.Fatal("fixture sin vuelta completa incluida")
	}
	shared := []ClassificationCorrection{
		classificationCorrectionRequest(base, ClassificationFieldSessionType, "race", "qualify"),
		classificationCorrectionRequest(base, ClassificationFieldWeatherConditions, "Dry", "Wet"),
	}
	inputs := []SampleCorrectionInput{*scalarInput}
	families := []LapFamilyUseCorrection{*familyRequest}
	legacySnap, err := PrepareMixedCorrectionSnapshot(base, inputs, original, families, session, shared)
	if err != nil {
		t.Fatal(err)
	}
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	withIdentity := append([]ClassificationCorrection{canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")}, shared...)
	canonicalSnap := identityDerivationSnapshot(t, base, inputs, original, families, session, withIdentity, target)
	legacy, err := DeriveCorrectedSession(base, session, pages, caller, legacySnap)
	if err != nil {
		t.Fatal(err)
	}
	identity, err := DeriveCorrectedSession(base, session, pages, caller, canonicalSnap)
	if err != nil {
		t.Fatal(err)
	}
	if legacy.Classified.Combination != caller.Combination || identity.Classified.Combination != *target {
		t.Fatal("la combinación efectiva no siguió a cada snapshot")
	}
	if legacy.Consumption.CombinationID != caller.Combination.ID || legacy.Curves.CombinationID != caller.Combination.ID || legacy.Pit.CombinationID != caller.Combination.ID {
		t.Fatal("IDs v3 no portan la combinación original")
	}
	if identity.Consumption.CombinationID != target.ID || identity.Curves.CombinationID != target.ID || identity.Pit.CombinationID != target.ID {
		t.Fatal("IDs v4 no portan la combinación del target")
	}
	// Sólo se normalizan los IDs ya comprobados: el resto del resultado debe
	// ser idéntico bit a bit, sin retirar familias ni magnitudes enteras.
	consumptionA, consumptionB := legacy.Consumption, identity.Consumption
	consumptionA.CombinationID, consumptionB.CombinationID = "", ""
	if !reflect.DeepEqual(consumptionA, consumptionB) {
		t.Fatal("la identidad cambió las magnitudes de consumo")
	}
	curvesA, curvesB := legacy.Curves, identity.Curves
	curvesA.CombinationID, curvesB.CombinationID = "", ""
	if !reflect.DeepEqual(curvesA, curvesB) {
		t.Fatal("la identidad cambió las curvas derivadas")
	}
	pitA, pitB := legacy.Pit, identity.Pit
	pitA.CombinationID, pitB.CombinationID = "", ""
	if !reflect.DeepEqual(pitA, pitB) {
		t.Fatal("la identidad cambió la observación de boxes")
	}
	if !reflect.DeepEqual(legacy.Validity, identity.Validity) {
		t.Fatal("la identidad cambió la validez reanalizada")
	}
	if legacy.Classified.Type != identity.Classified.Type || legacy.Classified.WeatherConditions != identity.Classified.WeatherConditions || !reflect.DeepEqual(legacy.Classified.Families, identity.Classified.Families) {
		t.Fatal("la identidad cambió tipo/clima/familias efectivas")
	}
	if reflect.DeepEqual(legacy.Classified.Combination, identity.Classified.Combination) {
		t.Fatal("la identidad no llegó a la combinación efectiva")
	}
}

func TestIdentityDerivationRejectsTamperedOrShiftedAtomically(t *testing.T) {
	base, session, pages := classifiedDerivationFixture(t)
	caller := classifiedDerivationCaller(t, session)
	target := canonicalTestTarget("Monza", "GP", "Oreca 07", "LMP2")
	track := canonicalTestRequest(base, target, ClassificationFieldTrackName, "Imola", "Monza")
	snapshot := identityDerivationSnapshot(t, base, nil, LapValidityAnalysis{}, nil, session, []ClassificationCorrection{track}, target)
	setMetadata := func(session *HistoricalSession, key, value string) {
		for i := range session.Metadata {
			if session.Metadata[i].Key == key {
				session.Metadata[i].Value = value
			}
		}
	}
	tests := []struct {
		name     string
		session  func(*HistoricalSession)
		snapshot func(*PreparedSampleCorrectionSnapshot)
		want     error
	}{
		{"corregido manipulado", nil, func(s *PreparedSampleCorrectionSnapshot) {
			s.Classifications[0].Corrected = "Otro"
		}, ErrInvalidCorrection},
		{"target forjado", nil, func(s *PreparedSampleCorrectionSnapshot) {
			forged := *s.CanonicalCombination
			forged.ID = canonicalTestTarget("IMOLA", "GP", "Oreca 07", "LMP2").ID
			s.CanonicalCombination = &forged
		}, ErrCorrectionTarget},
		{"campo no corregido desplazado", func(s *HistoricalSession) {
			setMetadata(s, "CarName", "Ferrari 499P")
		}, nil, ErrCorrectionPrecondition},
		{"SessionType original desconocido", func(s *HistoricalSession) {
			setMetadata(s, "SessionType", "banana")
		}, nil, ErrInvalidSessionClassification},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			alteredSession := session
			alteredSession.Metadata = append([]HistoricalMetadata(nil), session.Metadata...)
			if tc.session != nil {
				tc.session(&alteredSession)
			}
			alteredSnapshot := snapshot
			alteredSnapshot.Classifications = append([]PreparedClassificationCorrection(nil), snapshot.Classifications...)
			if tc.snapshot != nil {
				tc.snapshot(&alteredSnapshot)
			}
			got, err := DeriveCorrectedSession(base, alteredSession, pages, caller, alteredSnapshot)
			if !errors.Is(err, tc.want) || !reflect.DeepEqual(got, CorrectedSessionDerivations{}) {
				t.Fatalf("llegó %v, se esperaba %v", err, tc.want)
			}
		})
	}
}
