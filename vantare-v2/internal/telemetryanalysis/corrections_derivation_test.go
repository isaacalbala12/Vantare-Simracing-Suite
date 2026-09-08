package telemetryanalysis

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

func TestCorrectedDerivationRecomputesRecordedLapTimes(t *testing.T) {
	for _, quality := range []Quality{QualityValid, QualityInvalid} {
		t.Run(string(quality), func(t *testing.T) {
			fixture := loadLapValidityFixture(t, "lap-validity-s045-v1.json")
			session, pages := fixtureHistoricalInput(t, fixture)
			base, _, _, _ := correctionExample()
			base.SessionID = session.ID
			session.Provenance.Parser = ParserRef{ID: base.ParserID, Version: base.ParserVersion}
			session.Provenance.SchemaFingerprint = base.SchemaFingerprint
			classified := ClassifiedSession{SessionID: session.ID, Combination: CombinationIdentity{ID: "fixture-combination"}}
			// The sanitized fixture omits units; this test explicitly declares seconds
			// for its controlled Lap Time correction, not an inferred runtime unit.
			var inputs []SampleCorrectionInput
			for c := range session.Channels {
				if session.Channels[c].SourceName == "Lap Time" {
					channel := &session.Channels[c]
					channel.Unit = HistoricalUnit{Symbol: "s", Quality: QualityValid}
					for _, page := range pages {
						if page.ChannelID == channel.ID {
							for _, sample := range page.Samples {
								sample.Values[0].Quality = quality
								value := sample.Values[0]
								if value.Scalar.Number <= 0 {
									continue
								}
								replacement := value.Scalar
								replacement.Number++
								inputs = append(inputs, SampleCorrectionInput{Channel: *channel, Sample: sample, Request: SampleValueCorrection{Base: base, Target: SampleCorrectionTarget{ChannelID: channel.ID, Column: value.Column, SampleIndex: sample.Index}, Unit: channel.Unit, Expected: value, Replacement: replacement, Reason: "controlled one second test"}})
							}
						}
					}
				}
			}
			if len(inputs) == 0 {
				t.Fatal("fixture has no correction targets")
			}
			original, err := json.Marshal(pages)
			if err != nil {
				t.Fatal(err)
			}
			empty, err := PrepareSampleCorrectionSnapshot(base, nil)
			if err != nil {
				t.Fatal(err)
			}
			baseline, err := DeriveCorrectedSession(base, session, pages, classified, empty)
			if err != nil {
				t.Fatal(err)
			}
			snapshot, err := PrepareSampleCorrectionSnapshot(base, inputs)
			if err != nil {
				t.Fatal(err)
			}
			changed, err := DeriveCorrectedSession(base, session, pages, classified, snapshot)
			if err != nil {
				t.Fatal(err)
			}
			if changed.SnapshotID == baseline.SnapshotID || changed.Base != base {
				t.Fatal("reused uncorrected derivations")
			}
			if equal := reflect.DeepEqual(changed.Validity.Laps, baseline.Validity.Laps); equal != (quality == QualityInvalid) {
				t.Fatal("changed value promoted invalid quality or failed to rederive valid lap times")
			}
			after, err := json.Marshal(pages)
			if err != nil {
				t.Fatal(err)
			}
			if string(after) != string(original) {
				t.Fatal("original changed")
			}
			if changed.Consumption.SessionID != session.ID || changed.Curves.SessionID != session.ID || changed.Pit.SessionID != session.ID {
				t.Fatal("lost session identity")
			}
			wrongParser := session
			wrongParser.Provenance.Parser.Version = "other"
			if _, err := DeriveCorrectedSession(base, wrongParser, pages, classified, snapshot); !errors.Is(err, ErrCorrectionInterpretationChanged) {
				t.Fatal("wrong parser", err)
			}
			wrong := session
			wrong.ID = "other"
			if _, err := DeriveCorrectedSession(base, wrong, pages, classified, snapshot); !errors.Is(err, ErrCorrectionSourceChanged) {
				t.Fatal("wrong source", err)
			}
		})
	}
}
