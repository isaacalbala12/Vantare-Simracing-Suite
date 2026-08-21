package curation

import (
	"bytes"
	"encoding/json"
	"math"
	"strings"
	"testing"
	"time"
)

func validBundle() CurationBundleV1 {
	now := time.Now().UTC().Truncate(time.Second)
	epoch := QuantizeEpoch(now)
	return CurationBundleV1{
		Admin: AdminEnvelope{UploadID: "upload-1", DeleteHash: "delete-hash"},
		Payload: BundlePayload{
			ContractVersion:    ContractVersionV1,
			BundleID:           "bundle-1",
			CombinationID:      "spa-lmgt3",
			Epoch:              epoch,
			StintAggregates:    []StintAggregate{{StintNumber: 1, Laps: 12, AvgFuelPerLap: 2.8, AvgVEPerLap: 1.1}},
			PitAggregates:      &PitAggregates{Count: 1, AvgDurationSeconds: 32},
			ObservedStrategies: []ObservedStrategyRef{{StintCount: 2, PitLaps: []int{12}, Compounds: []string{"0"}}},
			ChannelQuality:     ChannelQuality{ValidSessions: 10, InvalidSessions: 0},
		},
	}
}

func TestCurationBundle_StrictDecode_Valid(t *testing.T) {
	b := validBundle()
	data, _ := json.Marshal(b)
	got, err := StrictDecode(data)
	if err != nil {
		t.Fatalf("strict decode: %v", err)
	}
	if got.Payload.BundleID != "bundle-1" {
		t.Fatalf("mismatch")
	}
}

func TestCurationBundle_StrictDecode_RejectUnknownFields(t *testing.T) {
	b := validBundle()
	m, _ := json.Marshal(b)
	var mm map[string]interface{}
	_ = json.Unmarshal(m, &mm)
	payload := mm["payload"].(map[string]interface{})
	payload["unknownField"] = 123
	m, _ = json.Marshal(mm)
	if _, err := StrictDecode(m); err == nil {
		t.Fatalf("expected unknown field rejection")
	}
	// tampoco dentro de admin
	b2 := validBundle()
	m2, _ := json.Marshal(b2)
	var mm2 map[string]interface{}
	_ = json.Unmarshal(m2, &mm2)
	mm2["admin"].(map[string]interface{})["extra"] = "x"
	m3, _ := json.Marshal(mm2)
	if _, err := StrictDecode(m3); err == nil {
		t.Fatalf("expected admin unknown field rejection")
	}
}

func TestCurationBundle_Denylist_PII(t *testing.T) {
	canaries := []string{
		"steamid: 12345",
		"driverName: Juan",
		"UserPath: C:\\Users\\isaac\\secret",
		"2026-08-21T14:00:00.000Z", // fecha absoluta no cuantizada suelta
	}
	for _, canary := range canaries {
		b := validBundle()
		// Inject via raw manipulation: create bundle with canary in payload via extra field that denylist catches
		data, _ := json.Marshal(b)
		// Append canary as extra json field via string replace (simulates attacker injecting)
		s := string(data)
		s = strings.Replace(s, `"bundle-1"`, `"bundle-1","injected":"`+canary+`"`, 1)
		// StrictDecode should fail due to unknown field OR denylist; we test denylist directly
		if err := denylistCheck([]byte(s)); err == nil {
			t.Fatalf("expected denylist to catch %q", canary)
		}
	}
}

func TestCurationBundle_EpochQuantized(t *testing.T) {
	if !EpochQuantized("2026-W33").Valid() {
		t.Fatalf("valid epoch rejected")
	}
	if EpochQuantized("2026-08-21").Valid() {
		t.Fatalf("absolute date should not be valid epoch")
	}
	now := time.Date(2026, 8, 21, 0, 0, 0, 0, time.UTC)
	eq := QuantizeEpoch(now)
	if eq != "2026-W34" {
		t.Fatalf("quantize got %q want 2026-W34", eq)
	}
}

func TestCurationBundle_StrictValidationTable(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*CurationBundleV1)
	}{
		{
			name: "negative channel sample",
			mutate: func(bundle *CurationBundleV1) {
				bundle.Payload.ChannelQuality.InvalidSessions = -1
			},
		},
		{
			name: "unsorted pit laps",
			mutate: func(bundle *CurationBundleV1) {
				bundle.Payload.ObservedStrategies = []ObservedStrategyRef{{StintCount: 3, PitLaps: []int{8, 4}}}
			},
		},
		{
			name: "non finite consumption",
			mutate: func(bundle *CurationBundleV1) {
				bundle.Payload.StintAggregates[0].AvgFuelPerLap = math.Inf(1)
			},
		},
		{
			name: "unnormalized combination",
			mutate: func(bundle *CurationBundleV1) {
				bundle.Payload.CombinationID = "Spa LMGT3"
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			bundle := validBundle()
			test.mutate(&bundle)
			if err := bundle.Validate(); err == nil {
				t.Fatal("invalid bundle was accepted")
			}
		})
	}
}

func TestCurationBundle_StrictDecodeRejectsTrailingValue(t *testing.T) {
	bundle := validBundle()
	data, err := json.Marshal(bundle)
	if err != nil {
		t.Fatalf("marshal bundle: %v", err)
	}
	data = append(data, []byte(` {}`)...)
	if _, err := StrictDecode(data); err == nil {
		t.Fatal("trailing JSON value was accepted")
	}
}

func TestCurationBundle_StrictDecodeRejectsDuplicateField(t *testing.T) {
	bundle := validBundle()
	data, err := json.Marshal(bundle)
	if err != nil {
		t.Fatalf("marshal bundle: %v", err)
	}
	data = bytes.Replace(data, []byte(`"bundleId":"bundle-1"`), []byte(`"bundleId":"bundle-1","bundleId":"bundle-2"`), 1)
	if _, err := StrictDecode(data); err == nil {
		t.Fatal("duplicate JSON field was accepted")
	}
}
