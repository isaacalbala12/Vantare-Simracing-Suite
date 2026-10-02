package overlayv2

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestStandingWireRetainsEveryTimingQualityAndPrecision(t *testing.T) {
	for _, q := range []Quality{QualityFresh, QualityStale, QualityMissing, QualityInvalid} {
		row := syntheticFullFrame(1).Standings[0]
		row.GapSeconds = QValue[float64]{Q: q, V: 1.23456789012345}
		row.BestLapSeconds = QValue[float64]{Q: QualityStale, V: 88.12345678901234}
		row.LastLapSeconds = QValue[float64]{Q: QualityInvalid, V: 99.45678901234567}
		if q == QualityMissing {
			row.GapSeconds.V = 0
		}
		raw, err := json.Marshal(row)
		if err != nil {
			t.Fatal(err)
		}
		var got StandingRowV2
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, row) {
			t.Fatalf("roundtrip differs quality%s\ngot%+v\nwant%+v", q, got, row)
		}
		if strings.Contains(string(raw), `"bestLap":{"`) {
			t.Fatalf("timing was not compact:%s", raw)
		}
	}
}

func TestRelativeWireDerivedAuthorityIsExplicitDefault(t *testing.T) {
	for _, authority := range []Authority{AuthorityDerived, AuthorityNative, AuthorityEstimated} {
		row := syntheticFullFrame(1).Relative[0]
		row.Authority = authority
		raw, err := json.Marshal(row)
		if err != nil {
			t.Fatal(err)
		}
		hasAuthority := strings.Contains(string(raw), `"authority"`)
		if hasAuthority != (authority != AuthorityDerived) {
			t.Fatalf("authority%s wire%s", authority, raw)
		}
		var got RelativeRowV2
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, row) {
			t.Fatalf("roundtrip authority%s differs", authority)
		}
	}
}

func TestStandingCompactMixedQualityFullFrameBudget(t *testing.T) {
	frame := syntheticFullFrame(104)
	withStringWidths(frame, 32)
	frame.Delta.History = adverseDeltaHistory()
	for i := range frame.Standings {
		frame.Standings[i].GapSeconds.Q = QualityStale
		frame.Standings[i].BestLapSeconds = QValue[float64]{Q: QualityMissing}
		frame.Standings[i].LastLapSeconds.Q = QualityInvalid
	}
	raw, err := json.Marshal(frame)
	if err != nil {
		t.Fatal(err)
	}
	var decoded FrameV2
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(frame, decoded) {
		t.Fatal("104-row mixed-quality roundtrip changed values or quality")
	}
	t.Logf("full104car32char120history three mixed qualities on every standing: %dbytes", len(raw))
	if len(raw) > 72*1024 {
		t.Fatalf("mixed quality frame=%d exceeds72KiB", len(raw))
	}
}

func TestStandingWireAcceptsLegacyAndRejectsUnknownQuality(t *testing.T) {
	for _, raw := range []string{
		`{"gap":{"q":"stale","v":1.23},"bestLap":{"q":"missing"},"lastLap":{"q":"invalid","v":98.25}}`,
		`{"quality":{"q":"fresh"},"gap":{"q":"stale","v":1.23},"bestLap":{"q":"missing"},"lastLap":{"q":"invalid","v":98.25}}`,
		`{"q":{"q":"f","g":"s","b":"m","l":"i"},"gap":1.23,"bestLap":0,"lastLap":98.25}`,
	} {
		var row StandingRowV2
		if err := json.Unmarshal([]byte(raw), &row); err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(row)
		if err != nil {
			t.Fatal(err)
		}
		var again StandingRowV2
		if err := json.Unmarshal(encoded, &again); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(again, row) {
			t.Fatalf("legacy roundtrip differs: %+v", again)
		}
		if row.GapSeconds != (QValue[float64]{Q: QualityStale, V: 1.23}) || row.BestLapSeconds.Q != QualityMissing || row.LastLapSeconds.Q != QualityInvalid {
			t.Fatalf("incorrect normalized timings: %+v", row)
		}
	}
	for _, raw := range []string{
		`{"q":{"q":"unknown"},"gap":0,"bestLap":0,"lastLap":0}`,
		`{"q":{"q":"f","g":"unknown"},"gap":0,"bestLap":0,"lastLap":0}`,
		`{"q":{"q":"f","g":"s","gap":"s"},"gap":0,"bestLap":0,"lastLap":0}`,
		`{"q":{"q":"m"},"gap":1,"bestLap":0,"lastLap":0}`,
		`{"gap":0,"bestLap":0,"lastLap":0}`,
		`{"q":{"q":"f","g":"s"},"gap":{"q":"fresh"},"bestLap":0,"lastLap":0}`,
		`{"q":{"q":"f"},"quality":{"q":"fresh"},"gap":0,"bestLap":0,"lastLap":0}`,
	} {
		var row StandingRowV2
		if err := json.Unmarshal([]byte(raw), &row); err == nil {
			t.Fatalf("accepted malformed wire %s", raw)
		}
	}
}

func TestRelativeWireRejectsUnknownAuthority(t *testing.T) {
	for _, raw := range []string{`{"authority":"unknown"}`, `{"authority":""}`, `{"authority":null}`} {
		var row RelativeRowV2
		if err := json.Unmarshal([]byte(raw), &row); err == nil {
			t.Fatalf("accepted malformed authority %s", raw)
		}
	}
}

func BenchmarkFullFrameCompactWire(b *testing.B) {
	frame := syntheticFullFrame(104)
	withStringWidths(frame, 32)
	frame.Delta.History = adverseDeltaHistory()
	b.ReportAllocs()
	b.ResetTimer()
	for range b.N {
		raw, err := json.Marshal(frame)
		if err != nil {
			b.Fatal(err)
		}
		b.SetBytes(int64(len(raw)))
	}
}
