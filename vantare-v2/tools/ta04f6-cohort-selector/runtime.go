package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
)

type CommitmentsV1 struct{ Recording, Serialization, Lap [32]byte }

func keyed(key [32]byte, domain string, parts ...[]byte) [32]byte {
	m := hmac.New(sha256.New, key[:])
	_, _ = m.Write([]byte(domain))
	for _, p := range parts {
		_, _ = m.Write(p)
	}
	var out [32]byte
	copy(out[:], m.Sum(nil))
	return out
}
func BuildCommitmentsV1(key [32]byte, sessionID string, serialization []byte, start, end uint64) CommitmentsV1 {
	r := keyed(key, "TA-04F6/recording/v1", []byte(sessionID))
	s := keyed(key, "TA-04F6/serialization/v1", serialization)
	l := BuildLapCommitmentV1(key, r, start, end)
	return CommitmentsV1{r, s, l}
}
func BuildLapCommitmentV1(key [32]byte, recording [32]byte, start, end uint64) [32]byte {
	var ord [16]byte
	binary.LittleEndian.PutUint64(ord[:8], start)
	binary.LittleEndian.PutUint64(ord[8:], end)
	return keyed(key, "TA-04F6/lap/v1", recording[:], ord[:])
}

type pendingCommitmentsV1 struct{ Recording, Serialization [32]byte }
type serializationRetentionV1 struct{ CurrentBytes, MaxBytes, CurrentBuffers, MaxBuffers int }

func commitRecordingV1(key [32]byte, sessionID string, recording CanonicalRecordingV1, ledger *serializationRetentionV1) (pendingCommitmentsV1, error) {
	serialized, err := SerializeV1(recording)
	if err != nil {
		return pendingCommitmentsV1{}, err
	}
	if ledger != nil {
		ledger.CurrentBytes += len(serialized)
		ledger.CurrentBuffers++
		if ledger.CurrentBytes > ledger.MaxBytes {
			ledger.MaxBytes = ledger.CurrentBytes
		}
		if ledger.CurrentBuffers > ledger.MaxBuffers {
			ledger.MaxBuffers = ledger.CurrentBuffers
		}
		defer func() { ledger.CurrentBytes -= len(serialized); ledger.CurrentBuffers-- }()
	}
	c := BuildCommitmentsV1(key, sessionID, serialized, 0, 0)
	return pendingCommitmentsV1{c.Recording, c.Serialization}, nil
}

type PageV1 struct {
	Start   int
	Samples []SampleV1
}

func CollectPagesV1(ctx context.Context, maxRows int, read func(start, limit int) (PageV1, error)) ([]SampleV1, error) {
	const size = 4096
	if ctx == nil || read == nil || maxRows <= 0 || maxRows > maxNumericChannelSamples {
		return nil, invalid()
	}
	var all []SampleV1
	for start := 0; ; start += size {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		p, err := read(start, size)
		if err != nil {
			return nil, err
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if p.Start != start || len(p.Samples) > size {
			return nil, invalid()
		}
		if len(p.Samples) >= maxRows-len(all) {
			return nil, invalid()
		}
		for i, s := range p.Samples {
			if s.Index != int64(start+i) || s.Quality != "valid" || !finite(s.Value) {
				return nil, invalid()
			}
		}
		all = append(all, p.Samples...)
		if len(p.Samples) < size {
			return all, nil
		}
		if start > int(^uint(0)>>1)-size {
			return nil, invalid()
		}
	}
}

type AggregateV1 struct {
	Version            string  `json:"version"`
	Outcome            string  `json:"outcome"`
	Recordings         int     `json:"recordings"`
	OracleEvaluable    int     `json:"oracle_evaluable"`
	LowEvent           int     `json:"low_event"`
	OracleInvalid      int     `json:"oracle_invalid"`
	Resets             int     `json:"resets"`
	Boundaries         int     `json:"boundaries"`
	Matches            int     `json:"matches"`
	Mismatches         int     `json:"mismatches"`
	OneSideInvalid     int     `json:"one_side_invalid"`
	PreliminaryWindows int     `json:"preliminary_windows"`
	ValidLaps          int     `json:"valid_laps"`
	SelectedRecordings int     `json:"selected_recordings"`
	SelectedLaps       int     `json:"selected_laps"`
	Center             float64 `json:"center"`
	Deterministic      bool    `json:"deterministic"`
	SensitivePayload   bool    `json:"sensitive_payload"`
}

type PopulationCountsV1 struct {
	Recordings      int `json:"recordings"`
	LowEvent        int `json:"low_event"`
	OracleInvalid   int `json:"oracle_invalid"`
	OracleEvaluable int `json:"oracle_evaluable"`
}
type PopulationLedgerV1 struct {
	Total    PopulationCountsV1
	ByDigest map[[32]byte]PopulationCountsV1
}

func BuildPopulationLedgerV1(results []RecordingResultV1) (PopulationLedgerV1, error) {
	ledger := PopulationLedgerV1{ByDigest: make(map[[32]byte]PopulationCountsV1)}
	for _, r := range results {
		total := ledger.Total
		group := ledger.ByDigest[r.GroupDigest]
		total.Recordings++
		group.Recordings++
		switch r.Population {
		case PopulationLowEvent:
			total.LowEvent++
			group.LowEvent++
		case PopulationInvalid:
			total.OracleInvalid++
			group.OracleInvalid++
		case PopulationEvaluable:
			total.OracleEvaluable++
			group.OracleEvaluable++
		default:
			return PopulationLedgerV1{}, invalid()
		}
		ledger.Total = total
		ledger.ByDigest[r.GroupDigest] = group
	}
	if ledger.Total.LowEvent+ledger.Total.OracleInvalid+ledger.Total.OracleEvaluable != ledger.Total.Recordings {
		return PopulationLedgerV1{}, invalid()
	}
	for _, v := range ledger.ByDigest {
		if v.LowEvent+v.OracleInvalid+v.OracleEvaluable != v.Recordings {
			return PopulationLedgerV1{}, invalid()
		}
	}
	return ledger, nil
}

func RunSyntheticV1() ([]byte, error) {
	var key [32]byte
	for i := range key {
		key[i] = byte(i)
	}
	base, err := syntheticRecordingV1(GroupKeyV1{"track", "layout", "car", "class"}, key)
	if err != nil {
		return nil, err
	}
	if base.Coordinates.Digest != (CoordinateDigestV1{0x02, 0x2c, 0xb5, 0x59, 0xb6, 0x84, 0xbe, 0xa0, 0x22, 0xff, 0xf3, 0x31, 0x8b, 0x20, 0x87, 0x1d, 0x6d, 0xfb, 0x11, 0xa8, 0xbc, 0x23, 0x89, 0x6f, 0x69, 0xcc, 0x02, 0xf7, 0x39, 0x84, 0xcd, 0x81}) {
		return nil, invalid()
	}
	serialized, err := SerializeV1(base)
	if err != nil || len(serialized) != 2615 || sha256.Sum256(serialized) != ([32]byte{0xbf, 0xee, 0x54, 0xcc, 0x81, 0x5e, 0xb3, 0xfc, 0xcf, 0xc8, 0xfe, 0xc9, 0xed, 0x59, 0x89, 0x4d, 0x98, 0xd2, 0xe2, 0xfd, 0xe8, 0x19, 0x96, 0xd7, 0x34, 0xaa, 0x43, 0x48, 0xe6, 0x4f, 0x75, 0x34}) {
		return nil, invalid()
	}
	decoded, err := DecodeV1(serialized)
	if err != nil {
		return nil, err
	}
	roundtrip, err := SerializeV1(decoded)
	if err != nil || !bytes.Equal(serialized, roundtrip) {
		return nil, invalid()
	}
	commitment := BuildCommitmentsV1(key, "synthetic-session", serialized, 0, 1)
	if commitment.Recording == ([32]byte{}) || commitment.Serialization == ([32]byte{}) || commitment.Lap == ([32]byte{}) {
		return nil, invalid()
	}
	groups := []GroupKeyV1{{"a", "l", "c", "x"}, {"track", "layout", "car", "class"}, {"track", "layout", "car", "class"}, {"track", "layout", "car", "class"}, {"c", "l", "c", "x"}, {"c", "l", "c", "x"}, {"c", "l", "c", "x"}, {"c", "l", "c", "x"}}
	results := make([]RecordingResultV1, 0, len(groups))
	a := AggregateV1{Version: "ta04f6/v1", Outcome: "cohort_frozen", Recordings: len(groups), Deterministic: true}
	for i, g := range groups {
		recording, buildErr := syntheticRecordingV1(g, key)
		if buildErr != nil {
			return nil, buildErr
		}
		r, err := ClassifyV1(recording)
		if err != nil {
			return nil, err
		}
		r.Order = i
		r.RecordingToken = string(rune('a' + i))
		results = append(results, r)
		switch r.Population {
		case PopulationEvaluable:
			a.OracleEvaluable++
		case PopulationLowEvent:
			a.LowEvent++
		case PopulationInvalid:
			a.OracleInvalid++
		}
		a.Resets += r.Resets
		a.Boundaries += r.Boundaries
		a.Matches += r.Matches
		a.Mismatches += r.Mismatches
		a.OneSideInvalid += r.OneSideInvalid
		a.PreliminaryWindows += len(r.PreliminaryLaps)
		a.ValidLaps += len(r.PreliminaryLaps)
	}
	f, err := SelectCohortV1(results)
	if err != nil {
		return nil, err
	}
	a.SelectedRecordings = len(f.Recordings)
	a.SelectedLaps = len(f.Laps)
	a.Center = f.Center
	if a.SelectedRecordings == 0 {
		a.Outcome = "stop_insufficient"
	}
	if a.Recordings != 8 || a.OracleEvaluable != 8 || a.LowEvent != 0 || a.OracleInvalid != 0 || a.Resets != 104 || a.Boundaries != 104 || a.Matches != 104 || a.Mismatches != 0 || a.OneSideInvalid != 0 || a.PreliminaryWindows != 96 || a.ValidLaps != 96 || a.SelectedRecordings != 3 || a.SelectedLaps != 36 || a.Center != 1 || f.Group != (GroupKeyV1{"track", "layout", "car", "class"}) {
		return nil, invalid()
	}
	return json.Marshal(a)
}

func syntheticRecordingV1(group GroupKeyV1, key [32]byte) (CanonicalRecordingV1, error) {
	lap, total := ChannelV1{Name: "Lap Dist", Present: true, Quality: "valid", Frequency: 1}, ChannelV1{Name: "Total Dist", Present: true, Quality: "valid", Frequency: 1}
	gps := ChannelV1{Name: "GPS Time", Present: true, Quality: "valid", Frequency: 2}
	for i := 0; i < 27; i++ {
		ld := 1.0
		if i > 0 && i%2 == 1 {
			ld = 0
		}
		lap.Samples = append(lap.Samples, SampleV1{int64(i), ld, "valid"})
		total.Samples = append(total.Samples, SampleV1{int64(i), float64(i), "valid"})
	}
	lat, lon := ChannelV1{Name: "GPS Latitude", Present: true, Quality: "valid", Frequency: 1}, ChannelV1{Name: "GPS Longitude", Present: true, Quality: "valid", Frequency: 1}
	for i := 0; i < 27; i++ {
		lat.Samples = append(lat.Samples, SampleV1{int64(i), 40 + float64(i)/1000, "valid"})
		lon.Samples = append(lon.Samples, SampleV1{int64(i), -8 - float64(i)/1000, "valid"})
	}
	digest, err := MaterializeCoordinateDigestV1(key, lat, lon)
	if err != nil {
		return CanonicalRecordingV1{}, err
	}
	for i := 0; i < 53; i++ {
		gps.Samples = append(gps.Samples, SampleV1{int64(i), float64(i)/2 + .25, "valid"})
	}
	events := EventChannelV1{Name: "Lap", Present: true, Quality: "valid", Events: []EventV1{{0, .25, 0, true, "valid"}}}
	for k := 0; k < 13; k++ {
		events.Events = append(events.Events, EventV1{int64(k + 1), float64(1+2*k) + .25, float64(k + 1), true, "valid"})
	}
	return CanonicalRecordingV1{Schema: 1, Group: group, Coordinates: CoordinateSummaryV1{LatitudeName: "GPS Latitude", LongitudeName: "GPS Longitude", LatitudePresent: true, LongitudePresent: true, LatitudeQuality: "valid", LongitudeQuality: "valid", Frequency: 1, Count: 27, FirstIndex: 0, LastIndex: 26, Digest: digest}, GPSTime: gps, LapDist: lap, TotalDist: total, LapEvents: events}, nil
}
