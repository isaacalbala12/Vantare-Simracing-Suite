package main

import (
	"context"
	"errors"
)

const (
	maxSamples = 2_000_000
	maxEvents  = 100_000
	pageSize   = 4096
)

type ScalarKind uint8

const (
	ScalarNumber ScalarKind = iota + 1
	ScalarInteger
	ScalarLap
)

type NumericSample struct {
	Index          int64
	Present, Valid bool
	Kind           ScalarKind
	Number         float64
	Integer        int64
}
type NumericPage struct {
	ChannelID string
	Start     int64
	Samples   []NumericSample
}
type PageReader interface {
	ReadPage(context.Context, string, int64, int) (NumericPage, error)
}

func readNumeric(ctx context.Context, r PageReader, id string, want ScalarKind, capLimit int) ([]float64, error) {
	if ctx == nil || r == nil || id == "" || capLimit <= 0 {
		return nil, errors.New("data_invalid")
	}
	out := make([]float64, 0)
	for start := int64(0); ; start += pageSize {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		p, err := r.ReadPage(ctx, id, start, pageSize)
		if err != nil {
			if e := ctx.Err(); e != nil {
				return nil, e
			}
			return nil, errors.New("data_invalid")
		}
		if p.ChannelID != id || p.Start != start || len(p.Samples) > pageSize || len(out)+len(p.Samples) > capLimit {
			return nil, errors.New("data_invalid")
		}
		for i, s := range p.Samples {
			if s.Index != start+int64(i) || !s.Present || !s.Valid {
				return nil, errors.New("data_invalid")
			}
			var v float64
			switch want {
			case ScalarNumber:
				if s.Kind != ScalarNumber {
					return nil, errors.New("data_invalid")
				}
				v = s.Number
			case ScalarLap:
				switch s.Kind {
				case ScalarNumber:
					v = s.Number
				case ScalarInteger:
					if s.Integer < -(1<<53) || s.Integer > 1<<53 {
						return nil, errors.New("data_invalid")
					}
					v = float64(s.Integer)
				default:
					return nil, errors.New("data_invalid")
				}
			default:
				return nil, errors.New("data_invalid")
			}
			if !finite(v) {
				return nil, errors.New("data_invalid")
			}
			out = append(out, v)
		}
		if len(p.Samples) < pageSize {
			break
		}
	}
	return out, nil
}

var requiredChannels = []string{"GPS Latitude", "GPS Longitude", "GPS Time", "Lap Dist", "Total Dist"}

type MaterializedChannel struct {
	Name          string
	Count         int
	Finite, Valid bool
}
type MaterializedRecording struct {
	Channels     []MaterializedChannel
	CompleteLaps int
}

func classifyRecording(r MaterializedRecording) string {
	found := map[string]bool{}
	count := -1
	for _, c := range r.Channels {
		if found[c.Name] || !c.Valid || !c.Finite || c.Count <= 0 {
			return "data_invalid"
		}
		found[c.Name] = true
		if count < 0 {
			count = c.Count
		} else if count != c.Count {
			return "data_invalid"
		}
	}
	for _, n := range requiredChannels {
		if !found[n] {
			return "data_invalid"
		}
	}
	if r.CompleteLaps < 0 || r.CompleteLaps > 20_000 {
		return "data_invalid"
	}
	if r.CompleteLaps < 2 {
		return "insufficient_laps"
	}
	return "accepted"
}

type LapEvent struct {
	Index            int64
	Timestamp, Value float64
	Present, Valid   bool
}
