package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"math"
	"unicode/utf8"
)

const maxElements = 1 << 24

type encoder struct{ bytes.Buffer }

func (e *encoder) u(v uint64) { _ = binary.Write(&e.Buffer, binary.LittleEndian, v) }
func (e *encoder) b(v bool) {
	if v {
		e.WriteByte(1)
	} else {
		e.WriteByte(0)
	}
}
func (e *encoder) s(v string) error {
	if !utf8.ValidString(v) {
		return invalid()
	}
	e.u(uint64(len(v)))
	e.WriteString(v)
	return nil
}
func (e *encoder) f(v float64) error {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return invalid()
	}
	e.u(math.Float64bits(v))
	return nil
}
func (e *encoder) hz(v float64) error {
	if math.IsNaN(v) || math.IsInf(v, 0) || v <= 0 || v != math.Trunc(v) {
		return invalid()
	}
	e.u(uint64(v))
	return nil
}

func validASCII(v string) bool {
	for i := 0; i < len(v); i++ {
		if v[i] > 0x7f {
			return false
		}
	}
	return true
}

func MaterializeCoordinateDigestV1(key [32]byte, latitude, longitude ChannelV1) (CoordinateDigestV1, error) {
	var zero CoordinateDigestV1
	if latitude.Name != "GPS Latitude" || longitude.Name != "GPS Longitude" || !finite(latitude.Frequency) || latitude.Frequency <= 0 || latitude.Frequency != longitude.Frequency || !latitude.Present || !longitude.Present || latitude.Quality != "valid" || longitude.Quality != "valid" || len(latitude.Samples) == 0 || len(latitude.Samples) > maxNumericChannelSamples || len(latitude.Samples) != len(longitude.Samples) || !validASCII(latitude.Name) || !validASCII(longitude.Name) {
		return zero, invalid()
	}
	var e encoder
	e.WriteString("TA-04F6/CoordinateDigestV1\x00")
	e.u(2)
	e.u(uint64(len(latitude.Samples)))
	for _, ch := range []ChannelV1{latitude, longitude} {
		if !validASCII(ch.Quality) {
			return zero, invalid()
		}
		if err := e.s(ch.Name); err != nil {
			return zero, err
		}
		e.b(ch.Present)
		e.u(uint64(len(ch.Samples)))
		for i, sample := range ch.Samples {
			if sample.Index < 0 || sample.Quality != "valid" || !validASCII(sample.Quality) || (i > 0 && sample.Index != ch.Samples[i-1].Index+1) || (ch.Name == "GPS Longitude" && sample.Index != latitude.Samples[i].Index) {
				return zero, invalid()
			}
			e.u(uint64(sample.Index))
			if err := e.f(sample.Value); err != nil {
				return zero, err
			}
			if err := e.s(sample.Quality); err != nil {
				return zero, err
			}
		}
	}
	mac := hmac.New(sha256.New, key[:])
	_, _ = mac.Write(e.Bytes())
	var digest CoordinateDigestV1
	copy(digest[:], mac.Sum(nil))
	return digest, nil
}

func SerializeV1(r CanonicalRecordingV1) ([]byte, error) {
	if r.Schema != 1 || r.Coordinates.LatitudeName != "GPS Latitude" || r.Coordinates.LongitudeName != "GPS Longitude" || r.GPSTime.Name != "GPS Time" || r.LapDist.Name != "Lap Dist" || r.TotalDist.Name != "Total Dist" || r.LapEvents.Name != "Lap" {
		return nil, invalid()
	}
	var e encoder
	e.WriteString("ta04f6/recording/v1\x00")
	e.u(r.Schema)
	for _, s := range []string{r.Group.TrackName, r.Group.TrackLayout, r.Group.CarName, r.Group.CarClass} {
		if err := e.s(s); err != nil {
			return nil, err
		}
	}
	c := r.Coordinates
	for _, s := range []string{c.LatitudeName, c.LongitudeName} {
		if err := e.s(s); err != nil {
			return nil, err
		}
	}
	e.b(c.LatitudePresent)
	e.b(c.LongitudePresent)
	for _, s := range []string{c.LatitudeQuality, c.LongitudeQuality} {
		if err := e.s(s); err != nil {
			return nil, err
		}
	}
	if err := e.hz(c.Frequency); err != nil {
		return nil, err
	}
	e.u(c.Count)
	if c.Count > maxNumericChannelSamples || c.FirstIndex < 0 || c.LastIndex < c.FirstIndex || uint64(c.LastIndex)-uint64(c.FirstIndex)+1 != c.Count || !c.LatitudePresent || !c.LongitudePresent || c.LatitudeQuality != "valid" || c.LongitudeQuality != "valid" {
		return nil, invalid()
	}
	e.u(uint64(c.FirstIndex))
	e.u(uint64(c.LastIndex))
	e.Write(c.Digest[:])
	for _, ch := range []ChannelV1{r.GPSTime, r.LapDist, r.TotalDist} {
		if err := writeChannel(&e, ch); err != nil {
			return nil, err
		}
	}
	if err := writeEvents(&e, r.LapEvents); err != nil {
		return nil, err
	}
	return e.Bytes(), nil
}

func writeChannel(e *encoder, ch ChannelV1) error {
	if !ch.Present || ch.Quality != "valid" || len(ch.Samples) > maxNumericChannelSamples {
		return invalid()
	}
	if err := e.s(ch.Name); err != nil {
		return err
	}
	e.b(ch.Present)
	if err := e.s(ch.Quality); err != nil {
		return err
	}
	if err := e.hz(ch.Frequency); err != nil {
		return err
	}
	e.u(uint64(len(ch.Samples)))
	for i, s := range ch.Samples {
		if s.Index < 0 || s.Quality != "valid" || (i > 0 && s.Index <= ch.Samples[i-1].Index) {
			return invalid()
		}
		e.u(uint64(s.Index))
		if err := e.f(s.Value); err != nil {
			return err
		}
	}
	return nil
}
func writeEvents(e *encoder, ch EventChannelV1) error {
	if !ch.Present || ch.Quality != "valid" || len(ch.Events) > maxLapEvents {
		return invalid()
	}
	if err := e.s(ch.Name); err != nil {
		return err
	}
	e.b(ch.Present)
	if err := e.s(ch.Quality); err != nil {
		return err
	}
	e.u(uint64(len(ch.Events)))
	for i, v := range ch.Events {
		if v.Index < 0 || !v.Present || v.Quality != "valid" || (i > 0 && v.Index <= ch.Events[i-1].Index) {
			return invalid()
		}
		e.u(uint64(v.Index))
		if err := e.f(v.Timestamp); err != nil {
			return err
		}
		if err := e.f(v.Value); err != nil {
			return err
		}
		if err := e.s(v.Quality); err != nil {
			return err
		}
	}
	return nil
}

type decoder struct {
	b []byte
	n int
}

func (d *decoder) take(n int) ([]byte, error) {
	if n < 0 || d.n+n > len(d.b) {
		return nil, invalid()
	}
	v := d.b[d.n : d.n+n]
	d.n += n
	return v, nil
}
func (d *decoder) u() (uint64, error) {
	b, e := d.take(8)
	if e != nil {
		return 0, e
	}
	return binary.LittleEndian.Uint64(b), nil
}
func (d *decoder) f() (float64, error) {
	u, e := d.u()
	if e != nil {
		return 0, e
	}
	v := math.Float64frombits(u)
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, invalid()
	}
	return v, nil
}
func (d *decoder) hz() (float64, error) {
	u, e := d.u()
	if e != nil || u == 0 || u > 1<<53 {
		return 0, invalid()
	}
	return float64(u), nil
}
func (d *decoder) bo() (bool, error) {
	b, e := d.take(1)
	if e != nil || b[0] > 1 {
		return false, invalid()
	}
	return b[0] == 1, nil
}
func (d *decoder) s() (string, error) {
	n, e := d.u()
	if e != nil || n > maxElements {
		return "", invalid()
	}
	b, e := d.take(int(n))
	if e != nil || !utf8.Valid(b) {
		return "", invalid()
	}
	return string(b), nil
}

func DecodeV1(b []byte) (CanonicalRecordingV1, error) {
	var r CanonicalRecordingV1
	if len(b) > maxSerializedBytes {
		return r, invalid()
	}
	d := decoder{b: b}
	domain, e := d.take(len("ta04f6/recording/v1\x00"))
	if e != nil || string(domain) != "ta04f6/recording/v1\x00" {
		return r, invalid()
	}
	if r.Schema, e = d.u(); e != nil {
		return r, e
	}
	ss := []*string{&r.Group.TrackName, &r.Group.TrackLayout, &r.Group.CarName, &r.Group.CarClass, &r.Coordinates.LatitudeName, &r.Coordinates.LongitudeName}
	for _, p := range ss {
		if *p, e = d.s(); e != nil {
			return r, e
		}
	}
	if r.Coordinates.LatitudePresent, e = d.bo(); e != nil {
		return r, e
	}
	if r.Coordinates.LongitudePresent, e = d.bo(); e != nil {
		return r, e
	}
	if r.Coordinates.LatitudeQuality, e = d.s(); e != nil {
		return r, e
	}
	if r.Coordinates.LongitudeQuality, e = d.s(); e != nil {
		return r, e
	}
	if r.Coordinates.Frequency, e = d.hz(); e != nil {
		return r, e
	}
	if r.Coordinates.Count, e = d.u(); e != nil {
		return r, e
	}
	u, e := d.u()
	if e != nil {
		return r, e
	}
	if u > math.MaxInt64 {
		return r, invalid()
	}
	r.Coordinates.FirstIndex = int64(u)
	u, e = d.u()
	if e != nil {
		return r, e
	}
	if u > math.MaxInt64 {
		return r, invalid()
	}
	r.Coordinates.LastIndex = int64(u)
	dig, e := d.take(32)
	if e != nil {
		return r, e
	}
	copy(r.Coordinates.Digest[:], dig)
	if r.Schema != 1 || r.Coordinates.Count > maxNumericChannelSamples || r.Coordinates.FirstIndex < 0 || r.Coordinates.LastIndex < r.Coordinates.FirstIndex || uint64(r.Coordinates.LastIndex)-uint64(r.Coordinates.FirstIndex)+1 != r.Coordinates.Count || !r.Coordinates.LatitudePresent || !r.Coordinates.LongitudePresent || r.Coordinates.LatitudeQuality != "valid" || r.Coordinates.LongitudeQuality != "valid" {
		return r, invalid()
	}
	for _, p := range []*ChannelV1{&r.GPSTime, &r.LapDist, &r.TotalDist} {
		if e = readChannel(&d, p); e != nil {
			return r, e
		}
	}
	if e = readEvents(&d, &r.LapEvents); e != nil {
		return r, e
	}
	if d.n != len(d.b) {
		return r, invalid()
	}
	if r.Coordinates.LatitudeName != "GPS Latitude" || r.Coordinates.LongitudeName != "GPS Longitude" || r.GPSTime.Name != "GPS Time" || r.LapDist.Name != "Lap Dist" || r.TotalDist.Name != "Total Dist" || r.LapEvents.Name != "Lap" {
		return r, invalid()
	}
	return r, nil
}
func readChannel(d *decoder, ch *ChannelV1) error {
	var e error
	if ch.Name, e = d.s(); e != nil {
		return e
	}
	if ch.Present, e = d.bo(); e != nil {
		return e
	}
	if ch.Quality, e = d.s(); e != nil {
		return e
	}
	if ch.Frequency, e = d.hz(); e != nil {
		return e
	}
	n, e := d.u()
	if e != nil || n > maxNumericChannelSamples || n > uint64((len(d.b)-d.n)/16) {
		return invalid()
	}
	if !ch.Present || ch.Quality != "valid" {
		return invalid()
	}
	ch.Samples = make([]SampleV1, int(n))
	for i := range ch.Samples {
		u, e := d.u()
		if e != nil {
			return e
		}
		if u > math.MaxInt64 {
			return invalid()
		}
		ch.Samples[i].Index = int64(u)
		if i > 0 && ch.Samples[i].Index <= ch.Samples[i-1].Index {
			return invalid()
		}
		if ch.Samples[i].Value, e = d.f(); e != nil {
			return e
		}
		ch.Samples[i].Quality = "valid"
	}
	return nil
}
func readEvents(d *decoder, ch *EventChannelV1) error {
	var e error
	if ch.Name, e = d.s(); e != nil {
		return e
	}
	if ch.Present, e = d.bo(); e != nil {
		return e
	}
	if ch.Quality, e = d.s(); e != nil {
		return e
	}
	n, e := d.u()
	if e != nil || n > maxLapEvents || n > uint64((len(d.b)-d.n)/32) {
		return invalid()
	}
	if !ch.Present || ch.Quality != "valid" {
		return invalid()
	}
	ch.Events = make([]EventV1, int(n))
	for i := range ch.Events {
		u, e := d.u()
		if e != nil {
			return e
		}
		if u > math.MaxInt64 {
			return invalid()
		}
		ch.Events[i].Index = int64(u)
		if i > 0 && ch.Events[i].Index <= ch.Events[i-1].Index {
			return invalid()
		}
		if ch.Events[i].Timestamp, e = d.f(); e != nil {
			return e
		}
		if ch.Events[i].Value, e = d.f(); e != nil {
			return e
		}
		if ch.Events[i].Quality, e = d.s(); e != nil {
			return e
		}
		if ch.Events[i].Quality != "valid" {
			return invalid()
		}
		ch.Events[i].Present = true
	}
	return nil
}
