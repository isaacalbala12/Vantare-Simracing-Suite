package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"math"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
)

type historicalParserV1 interface {
	Inspect(context.Context) (telemetryanalysis.HistoricalSession, error)
	ReadPage(context.Context, string, int64, int) (telemetryanalysis.HistoricalPage, error)
}

func materializeRecordingV1(ctx context.Context, parser historicalParserV1, key [32]byte) (CanonicalRecordingV1, bool, string, error) {
	if ctx == nil || parser == nil {
		return CanonicalRecordingV1{}, false, "", invalid()
	}
	session, err := parser.Inspect(ctx)
	if err != nil {
		return CanonicalRecordingV1{}, false, "", err
	}
	group, err := publicGroupV1(session.Metadata)
	if err != nil {
		return CanonicalRecordingV1{}, false, "", invalid()
	}
	group = normalizeGroupV1(group)
	partial := CanonicalRecordingV1{Schema: 1, Group: group,
		Coordinates: CoordinateSummaryV1{LatitudeName: "GPS Latitude", LongitudeName: "GPS Longitude", LatitudeQuality: "missing", LongitudeQuality: "missing"},
		GPSTime:     ChannelV1{Name: "GPS Time", Quality: "missing"}, LapDist: ChannelV1{Name: "Lap Dist", Quality: "missing"}, TotalDist: ChannelV1{Name: "Total Dist", Quality: "missing"},
		LapEvents: EventChannelV1{Name: "Lap", Quality: "missing"}}
	if !isAlgarveV1(group) {
		return CanonicalRecordingV1{}, false, "", nil
	}
	channels := make(map[string]telemetryanalysis.HistoricalChannel)
	for _, ch := range session.Channels {
		if _, exists := channels[ch.SourceName]; exists {
			return partial, true, session.ID, invalid()
		}
		channels[ch.SourceName] = ch
	}
	if lap, ok := channels["Lap"]; ok {
		events, readErr := readEventsV1(ctx, parser, lap)
		if readErr != nil {
			return partial, true, session.ID, readErr
		}
		partial.LapEvents = events
	}
	if gpsChannel, ok := channels["GPS Time"]; ok {
		gps, readErr := readContinuousV1(ctx, parser, gpsChannel)
		if readErr != nil {
			return partial, true, session.ID, readErr
		}
		partial.GPSTime = gps
	}
	lat, latOK := channels["GPS Latitude"]
	lon, lonOK := channels["GPS Longitude"]
	if latOK && lonOK {
		coordinates, readErr := streamCoordinateDigestV1(ctx, parser, lat, lon, key)
		if readErr != nil {
			return partial, true, session.ID, readErr
		}
		partial.Coordinates = coordinates
	}
	if channel, ok := channels["Lap Dist"]; ok {
		lapDist, readErr := readContinuousV1(ctx, parser, channel)
		if readErr != nil {
			return partial, true, session.ID, readErr
		}
		partial.LapDist = lapDist
	}
	if channel, ok := channels["Total Dist"]; ok {
		totalDist, readErr := readContinuousV1(ctx, parser, channel)
		if readErr != nil {
			return partial, true, session.ID, readErr
		}
		partial.TotalDist = totalDist
	}
	return partial, true, session.ID, nil
}

func publicGroupV1(metadata []telemetryanalysis.HistoricalMetadata) (GroupKeyV1, error) {
	values := map[string]string{}
	for _, m := range metadata {
		switch m.Key {
		case "TrackName", "TrackLayout", "CarName", "CarClass":
			if _, duplicate := values[m.Key]; duplicate || m.Sensitive || m.Redacted || !m.Present || m.Quality != telemetryanalysis.QualityValid || normalizePublicV1(m.Value) == "" {
				return GroupKeyV1{}, invalid()
			}
			values[m.Key] = m.Value
		}
	}
	if len(values) != 4 {
		return GroupKeyV1{}, invalid()
	}
	return GroupKeyV1{values["TrackName"], values["TrackLayout"], values["CarName"], values["CarClass"]}, nil
}

func validNumericChannelV1(ch telemetryanalysis.HistoricalChannel, event bool) bool {
	kind := telemetryanalysis.SamplingContinuousImplicitFrequency
	if event {
		kind = telemetryanalysis.SamplingEventTimestamped
	}
	if ch.Capability != telemetryanalysis.QualityValid || ch.Sampling.Kind != kind || (!event && ch.Sampling.FrequencyHz <= 0) || len(ch.Columns) != 1 {
		return false
	}
	if event {
		return ch.Columns[0].Type == telemetryanalysis.ScalarInteger || ch.Columns[0].Type == telemetryanalysis.ScalarNumber
	}
	return ch.Columns[0].Type == telemetryanalysis.ScalarNumber
}

func scanNumericV1(ctx context.Context, parser historicalParserV1, ch telemetryanalysis.HistoricalChannel, max int, visit func(telemetryanalysis.HistoricalSample) error) (int64, int64, uint64, error) {
	if !validNumericChannelV1(ch, false) {
		return 0, 0, 0, invalid()
	}
	var first, last int64
	var count uint64
	for start := int64(0); ; start += 4096 {
		if err := ctx.Err(); err != nil {
			return 0, 0, 0, err
		}
		page, err := parser.ReadPage(ctx, ch.ID, start, 4096)
		if err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return 0, 0, 0, ctxErr
			}
			return 0, 0, 0, structural()
		}
		if page.Start != start || page.ChannelID != ch.ID || len(page.Samples) > 4096 || int(count)+len(page.Samples) >= max {
			return 0, 0, 0, structural()
		}
		for i, s := range page.Samples {
			if s.Index != start+int64(i) || len(s.Values) != 1 {
				return 0, 0, 0, structural()
			}
			v := s.Values[0]
			if !v.Present || v.Quality != telemetryanalysis.QualityValid || v.Scalar.Kind != telemetryanalysis.ScalarNumber || !finite(v.Scalar.Number) {
				return 0, 0, 0, invalid()
			}
			if count == 0 {
				first = s.Index
			}
			last = s.Index
			count++
			if visit != nil {
				if err := visit(s); err != nil {
					return 0, 0, 0, err
				}
			}
		}
		if len(page.Samples) < 4096 {
			break
		}
	}
	if count == 0 {
		return 0, 0, 0, invalid()
	}
	return first, last, count, nil
}

func readContinuousV1(ctx context.Context, parser historicalParserV1, ch telemetryanalysis.HistoricalChannel) (ChannelV1, error) {
	out := ChannelV1{Name: ch.SourceName, Present: true, Quality: "valid", Frequency: float64(ch.Sampling.FrequencyHz)}
	_, _, _, err := scanNumericV1(ctx, parser, ch, maxNumericChannelSamples, func(s telemetryanalysis.HistoricalSample) error {
		out.Samples = append(out.Samples, SampleV1{s.Index, s.Values[0].Scalar.Number, "valid"})
		return nil
	})
	return out, err
}

func streamCoordinateDigestV1(ctx context.Context, parser historicalParserV1, lat, lon telemetryanalysis.HistoricalChannel, key [32]byte) (CoordinateSummaryV1, error) {
	var zero CoordinateSummaryV1
	if lat.SourceName != "GPS Latitude" || lon.SourceName != "GPS Longitude" || lat.Sampling.FrequencyHz != lon.Sampling.FrequencyHz {
		return zero, invalid()
	}
	lf, ll, lc, err := scanNumericV1(ctx, parser, lat, maxNumericChannelSamples, nil)
	if err != nil {
		return zero, err
	}
	of, ol, oc, err := scanNumericV1(ctx, parser, lon, maxNumericChannelSamples, nil)
	if err != nil || lf != of || ll != ol || lc != oc {
		return zero, invalid()
	}
	mac := hmac.New(sha256.New, key[:])
	writeStringHashV1(mac, "TA-04F6/CoordinateDigestV1\x00")
	writeUintHashV1(mac, 2)
	writeUintHashV1(mac, lc)
	for _, ch := range []telemetryanalysis.HistoricalChannel{lat, lon} {
		writeFramedStringHashV1(mac, ch.SourceName)
		_, _ = mac.Write([]byte{1})
		writeUintHashV1(mac, lc)
		_, _, _, err = scanNumericV1(ctx, parser, ch, maxNumericChannelSamples, func(s telemetryanalysis.HistoricalSample) error {
			writeUintHashV1(mac, uint64(s.Index))
			writeUintHashV1(mac, math.Float64bits(s.Values[0].Scalar.Number))
			writeFramedStringHashV1(mac, "valid")
			return nil
		})
		if err != nil {
			return zero, err
		}
	}
	var digest CoordinateDigestV1
	copy(digest[:], mac.Sum(nil))
	return CoordinateSummaryV1{LatitudeName: "GPS Latitude", LongitudeName: "GPS Longitude", LatitudePresent: true, LongitudePresent: true, LatitudeQuality: "valid", LongitudeQuality: "valid", Frequency: float64(lat.Sampling.FrequencyHz), Count: lc, FirstIndex: lf, LastIndex: ll, Digest: digest}, nil
}
func writeUintHashV1(w interface{ Write([]byte) (int, error) }, v uint64) {
	var b [8]byte
	binary.LittleEndian.PutUint64(b[:], v)
	_, _ = w.Write(b[:])
}
func writeStringHashV1(w interface{ Write([]byte) (int, error) }, s string) {
	_, _ = w.Write([]byte(s))
}
func writeFramedStringHashV1(w interface{ Write([]byte) (int, error) }, s string) {
	writeUintHashV1(w, uint64(len(s)))
	writeStringHashV1(w, s)
}

func readEventsV1(ctx context.Context, parser historicalParserV1, ch telemetryanalysis.HistoricalChannel) (EventChannelV1, error) {
	out := EventChannelV1{Name: "Lap", Present: true, Quality: "valid"}
	if ch.SourceName != "Lap" || !validNumericChannelV1(ch, true) {
		return out, invalid()
	}
	for start := int64(0); ; start += 4096 {
		if err := ctx.Err(); err != nil {
			return out, err
		}
		p, err := parser.ReadPage(ctx, ch.ID, start, 4096)
		if err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return out, ctxErr
			}
			return out, structural()
		}
		if p.Start != start || p.ChannelID != ch.ID || len(p.Samples) > 4096 || len(out.Events)+len(p.Samples) >= maxLapEvents {
			return out, structural()
		}
		for i, s := range p.Samples {
			if s.Index != start+int64(i) || len(s.Values) != 1 {
				return out, structural()
			}
			v := s.Values[0]
			timestamp := math.NaN()
			if s.TimestampSeconds != nil {
				timestamp = *s.TimestampSeconds
			}
			value := math.NaN()
			quality := string(v.Quality)
			present := v.Present
			switch v.Scalar.Kind {
			case telemetryanalysis.ScalarNumber:
				value = v.Scalar.Number
			case telemetryanalysis.ScalarInteger:
				const maxExactFloatInteger = int64(1 << 53)
				if v.Scalar.Integer >= -maxExactFloatInteger && v.Scalar.Integer <= maxExactFloatInteger {
					value = float64(v.Scalar.Integer)
				} else {
					quality = "invalid"
				}
			default:
				quality = "invalid"
			}
			if quality == "" {
				quality = "unknown"
			}
			out.Events = append(out.Events, EventV1{s.Index, timestamp, value, present, quality})
		}
		if len(p.Samples) < 4096 {
			break
		}
	}
	return out, nil
}
