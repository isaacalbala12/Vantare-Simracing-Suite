package launcher

import "sort"

type DelayRecommendation struct {
	ProfileID string
	DelayMs   int64
	Samples   int
}

type SessionDelayRecorder struct {
	samples map[string][]int64
}

func NewSessionDelayRecorder() *SessionDelayRecorder {
	return &SessionDelayRecorder{samples: make(map[string][]int64)}
}

func (r *SessionDelayRecorder) Add(profileID string, durationMs int64) {
	if profileID == "" || durationMs < 0 {
		return
	}
	r.samples[profileID] = append(r.samples[profileID], durationMs)
}

func (r *SessionDelayRecorder) Recommend(profileID string) (DelayRecommendation, bool) {
	values := append([]int64(nil), r.samples[profileID]...)
	if len(values) < 3 {
		return DelayRecommendation{}, false
	}
	sort.Slice(values, func(i, j int) bool { return values[i] < values[j] })
	return DelayRecommendation{ProfileID: profileID, DelayMs: values[len(values)/2], Samples: len(values)}, true
}
