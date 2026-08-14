package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"math"
	"testing"
)

func goldenRecording(t *testing.T) CanonicalRecordingV1 {
	t.Helper()
	key := [32]byte{}
	for i := range key {
		key[i] = byte(i)
	}
	lat, lon := ChannelV1{Name: "GPS Latitude", Present: true, Quality: "valid", Frequency: 1}, ChannelV1{Name: "GPS Longitude", Present: true, Quality: "valid", Frequency: 1}
	lap, total := ChannelV1{Name: "Lap Dist", Present: true, Quality: "valid", Frequency: 1}, ChannelV1{Name: "Total Dist", Present: true, Quality: "valid", Frequency: 1}
	gps := ChannelV1{Name: "GPS Time", Present: true, Quality: "valid", Frequency: 2}
	for i := 0; i < 27; i++ {
		ld := 1.0
		if i > 0 && i%2 == 1 {
			ld = 0
		}
		lat.Samples = append(lat.Samples, SampleV1{Index: int64(i), Value: 40 + float64(i)/1000, Quality: "valid"})
		lon.Samples = append(lon.Samples, SampleV1{Index: int64(i), Value: -8 - float64(i)/1000, Quality: "valid"})
		lap.Samples = append(lap.Samples, SampleV1{Index: int64(i), Value: ld, Quality: "valid"})
		total.Samples = append(total.Samples, SampleV1{Index: int64(i), Value: float64(i), Quality: "valid"})
	}
	for i := 0; i < 53; i++ {
		gps.Samples = append(gps.Samples, SampleV1{Index: int64(i), Value: float64(i)/2 + .25, Quality: "valid"})
	}
	events := EventChannelV1{Name: "Lap", Present: true, Quality: "valid"}
	events.Events = append(events.Events, EventV1{Index: 0, Timestamp: .25, Value: 0, Present: true, Quality: "valid"})
	for k := 0; k < 13; k++ {
		events.Events = append(events.Events, EventV1{Index: int64(k + 1), Timestamp: float64(1+2*k) + .25, Value: float64(k + 1), Present: true, Quality: "valid"})
	}
	digest, err := MaterializeCoordinateDigestV1(key, lat, lon)
	if err != nil {
		t.Fatal(err)
	}
	framed := independentCoordinateFrame(t, lat, lon)
	if len(framed) != 1668 {
		t.Fatalf("coordinate framing length=%d", len(framed))
	}
	mac := hmac.New(sha256.New, key[:])
	_, _ = mac.Write(framed)
	if got := hex.EncodeToString(mac.Sum(nil)); got != "022cb559b684bea022fff3318b20871d6dfb11a8bc23896f69cc02f73984cd81" {
		t.Fatalf("independent coordinate digest=%s", got)
	}
	if got := hex.EncodeToString(digest[:]); got != "022cb559b684bea022fff3318b20871d6dfb11a8bc23896f69cc02f73984cd81" {
		t.Fatalf("coordinate digest=%s", got)
	}
	return CanonicalRecordingV1{Schema: 1, Group: GroupKeyV1{"track", "layout", "car", "class"}, Coordinates: CoordinateSummaryV1{LatitudeName: "GPS Latitude", LongitudeName: "GPS Longitude", LatitudePresent: true, LongitudePresent: true, LatitudeQuality: "valid", LongitudeQuality: "valid", Frequency: 1, Count: 27, FirstIndex: 0, LastIndex: 26, Digest: digest}, GPSTime: gps, LapDist: lap, TotalDist: total, LapEvents: events}
}

func independentCoordinateFrame(t *testing.T, latitude, longitude ChannelV1) []byte {
	t.Helper()
	var b bytes.Buffer
	u := func(v uint64) {
		if err := binary.Write(&b, binary.LittleEndian, v); err != nil {
			t.Fatal(err)
		}
	}
	s := func(v string) { u(uint64(len(v))); b.WriteString(v) }
	f := func(v float64) { u(math.Float64bits(v)) }
	b.WriteString("TA-04F6/CoordinateDigestV1\x00")
	u(2)
	u(uint64(len(latitude.Samples)))
	for _, ch := range []ChannelV1{latitude, longitude} {
		s(ch.Name)
		if ch.Present {
			b.WriteByte(1)
		} else {
			b.WriteByte(0)
		}
		u(uint64(len(ch.Samples)))
		for _, sample := range ch.Samples {
			u(uint64(sample.Index))
			f(sample.Value)
			s(sample.Quality)
		}
	}
	return b.Bytes()
}

func TestGoldenSerializationV1(t *testing.T) {
	r := goldenRecording(t)
	b, err := SerializeV1(r)
	if err != nil {
		t.Fatal(err)
	}
	if len(b) != 2615 {
		t.Fatalf("length=%d", len(b))
	}
	sum := sha256.Sum256(b)
	if got := hex.EncodeToString(sum[:]); got != "bfee54cc815eb3fccfc8fec9ed59894d98d2e2fde81996d734aa4348e64f7534" {
		t.Fatalf("sha=%s", got)
	}
	decoded, err := DecodeV1(b)
	if err != nil {
		t.Fatal(err)
	}
	again, err := SerializeV1(decoded)
	if err != nil || string(again) != string(b) {
		t.Fatalf("round trip mismatch: %v", err)
	}
	if _, err := DecodeV1(append(b, 0)); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("trailing bytes: %v", err)
	}
}

func TestDecoderRejectsCorruptBoolAndImpossibleCount(t *testing.T) {
	b, err := SerializeV1(goldenRecording(t))
	if err != nil {
		t.Fatal(err)
	}
	off := len("ta04f6/recording/v1\x00") + 8
	for i := 0; i < 6; i++ {
		n := int(binary.LittleEndian.Uint64(b[off : off+8]))
		off += 8 + n
	}
	badBool := append([]byte(nil), b...)
	badBool[off] = 2
	if _, err := DecodeV1(badBool); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("bool: %v", err)
	}
	off += 2
	for i := 0; i < 2; i++ {
		n := int(binary.LittleEndian.Uint64(b[off : off+8]))
		off += 8 + n
	}
	off += 8
	badCount := append([]byte(nil), b...)
	binary.LittleEndian.PutUint64(badCount[off:off+8], maxElements+1)
	if _, err := DecodeV1(badCount); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("count: %v", err)
	}
}

func TestDecoderRejectsOversizeInputAndForgedCountsBeforeAllocation(t *testing.T) {
	if _, err := DecodeV1(make([]byte, maxSerializedBytes+1)); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("oversize: %v", err)
	}
	b, err := SerializeV1(goldenRecording(t))
	if err != nil {
		t.Fatal(err)
	}
	off := len("ta04f6/recording/v1\x00") + 8
	for i := 0; i < 6; i++ {
		n := int(binary.LittleEndian.Uint64(b[off : off+8]))
		off += 8 + n
	}
	off += 2
	for i := 0; i < 2; i++ {
		n := int(binary.LittleEndian.Uint64(b[off : off+8]))
		off += 8 + n
	}
	off += 8*4 + 32
	n := int(binary.LittleEndian.Uint64(b[off : off+8]))
	off += 8 + n + 1
	n = int(binary.LittleEndian.Uint64(b[off : off+8]))
	off += 8 + n + 8
	forged := append([]byte(nil), b...)
	binary.LittleEndian.PutUint64(forged[off:off+8], maxNumericChannelSamples)
	if _, err := DecodeV1(forged[:off+8]); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("forged count: %v", err)
	}
	forgedIndex := append([]byte(nil), b...)
	binary.LittleEndian.PutUint64(forgedIndex[off+8:off+16], ^uint64(0))
	if _, err := DecodeV1(forgedIndex); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("uint index overflow: %v", err)
	}
}

func TestSerializerRejectsLossyAcceptedDomain(t *testing.T) {
	base := goldenRecording(t)
	cases := []func(*CanonicalRecordingV1){func(r *CanonicalRecordingV1) { r.GPSTime.Samples[0].Quality = "bad" }, func(r *CanonicalRecordingV1) { r.LapEvents.Events[0].Present = false }, func(r *CanonicalRecordingV1) { r.GPSTime.Samples[1].Index = r.GPSTime.Samples[0].Index }, func(r *CanonicalRecordingV1) { r.LapEvents.Events[1].Index = r.LapEvents.Events[0].Index }}
	for i, mutate := range cases {
		r := cloneRecording(base)
		mutate(&r)
		if _, err := SerializeV1(r); !IsCode(err, CodeDataInvalid) {
			t.Fatalf("case %d: %v", i, err)
		}
	}
	huge := cloneRecording(base)
	huge.GPSTime.Samples = make([]SampleV1, maxNumericChannelSamples+1)
	if _, err := SerializeV1(huge); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("channel cap: %v", err)
	}
	events := cloneRecording(base)
	events.LapEvents.Events = make([]EventV1, maxLapEvents+1)
	if _, err := SerializeV1(events); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("event cap: %v", err)
	}
}

func TestSerializationRejectsInvalidValuesAndCoordinatesAreBound(t *testing.T) {
	r := goldenRecording(t)
	r.GPSTime.Samples[0].Value = math.NaN()
	if _, err := SerializeV1(r); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("NaN: %v", err)
	}

	base := goldenRecording(t)
	key := [32]byte{}
	for i := range key {
		key[i] = byte(i)
	}
	lat := ChannelV1{Name: "GPS Latitude", Present: true, Quality: "valid", Frequency: 1, Samples: []SampleV1{{0, 40, "valid"}, {1, 41, "valid"}}}
	lon := ChannelV1{Name: "GPS Longitude", Present: true, Quality: "valid", Frequency: 1, Samples: []SampleV1{{0, -8, "valid"}, {1, -9, "valid"}}}
	d1, err := MaterializeCoordinateDigestV1(key, lat, lon)
	if err != nil {
		t.Fatal(err)
	}
	lon.Samples[1].Value = -9.1
	d2, err := MaterializeCoordinateDigestV1(key, lat, lon)
	if err != nil {
		t.Fatal(err)
	}
	if d1 == d2 {
		t.Fatal("coordinate value did not change digest")
	}
	if _, err := MaterializeCoordinateDigestV1(key, lon, lat); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("reordered channels: %v", err)
	}
	if base.Coordinates.Digest == (CoordinateDigestV1{}) {
		t.Fatal("materialized digest missing")
	}
	badName := goldenRecording(t)
	badName.GPSTime.Name = "Lap Dist"
	if _, err := SerializeV1(badName); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("channel order/name: %v", err)
	}
	badUTF := goldenRecording(t)
	badUTF.Group.TrackName = string([]byte{0xff})
	if _, err := SerializeV1(badUTF); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("utf8: %v", err)
	}
}

func TestCoordinateMaterializationRejectsInvalidMetadataBeforeHMAC(t *testing.T) {
	var key [32]byte
	valid := func() (ChannelV1, ChannelV1) {
		return ChannelV1{Name: "GPS Latitude", Present: true, Quality: "valid", Frequency: 10, Samples: []SampleV1{{0, 1, "valid"}, {1, 2, "valid"}}}, ChannelV1{Name: "GPS Longitude", Present: true, Quality: "valid", Frequency: 10, Samples: []SampleV1{{0, 3, "valid"}, {1, 4, "valid"}}}
	}
	cases := []func(*ChannelV1, *ChannelV1){func(a, b *ChannelV1) { a.Frequency = 0 }, func(a, b *ChannelV1) { a.Frequency = math.NaN() }, func(a, b *ChannelV1) { b.Present = false }, func(a, b *ChannelV1) { a.Quality = "bad" }, func(a, b *ChannelV1) { b.Samples = b.Samples[:1] }, func(a, b *ChannelV1) { b.Samples[1].Index = 2 }}
	for i, mutate := range cases {
		a, b := valid()
		mutate(&a, &b)
		if _, err := MaterializeCoordinateDigestV1(key, a, b); !IsCode(err, CodeDataInvalid) {
			t.Fatalf("case %d: %v", i, err)
		}
	}
}
