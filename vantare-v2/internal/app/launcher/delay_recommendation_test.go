package launcher

import "testing"

func TestSessionDelayRecorderNeedsThreeEphemeralSamples(t *testing.T) {
	r := NewSessionDelayRecorder()
	for _, sample := range []int64{300, 100, 200} {
		r.Add("creator", sample)
	}
	recommendation, ok := r.Recommend("creator")
	if !ok || recommendation.DelayMs != 200 || recommendation.Samples != 3 {
		t.Fatalf("unexpected recommendation: %+v, ok=%v", recommendation, ok)
	}
	if _, ok := r.Recommend("missing"); ok {
		t.Fatal("missing profile should have no recommendation")
	}
}
