package main

import (
	"bytes"
	"encoding/hex"
	"math"
	"testing"
	"time"
)

func TestInventoryEmptyGoldenAndCanonicalEquality(t *testing.T) {
	var key [32]byte
	for i := range key {
		key[i] = byte(i)
	}
	got := inventoryDigest(key, nil)
	if hex.EncodeToString(got[:]) != "e85655a91956ad430844d4196c3d64e15556022e2ba0bd4efb3900b0a0ef7570" {
		t.Fatalf("digest %x", got)
	}
	a := []InventoryItem{{ID: "b", Modified: time.Unix(2, 0), Size: 2, Regular: true, WALAbsent: true, Stable: true}, {ID: "a", Modified: time.Unix(1, 0), Size: 1, Regular: true, WALAbsent: true, Stable: true}}
	b := []InventoryItem{a[1], a[0]}
	if inventoryDigest(key, a) != inventoryDigest(key, b) {
		t.Fatal("raw reorder changed canonical digest")
	}
	b[0].Size++
	if inventoryDigest(key, a) == inventoryDigest(key, b) {
		t.Fatal("mutation not detected")
	}
}

func TestRigidMedianAndThresholds(t *testing.T) {
	p := make([]Point, 1000)
	q := make([]Point, 1000)
	for i := range p {
		a := 2 * math.Pi * (float64(i) + .5) / 1000
		p[i] = Point{100 * math.Cos(a), 100 * math.Sin(a)}
		q[i] = Point{-p[i].Y + 17, p[i].X - 23}
	}
	aligned, err := alignRigid(q, p)
	if err != nil {
		t.Fatal(err)
	}
	for i := range p {
		if math.Hypot(aligned[i].X-p[i].X, aligned[i].Y-p[i].Y) > 1e-9 {
			t.Fatal(i)
		}
	}
	if v, err := median([]float64{-math.MaxFloat64, math.MaxFloat64}); err != nil || v != 0 {
		t.Fatalf("median %v %v", v, err)
	}
	if !slotPass(5, 10) || slotPass(math.Nextafter(5, math.Inf(1)), 10) || !recordingPass(4, 5) || recordingPass(3, 5) {
		t.Fatal("inclusive thresholds")
	}
}

func TestDecisionsConservationAndSyntheticDeterminism(t *testing.T) {
	for _, tc := range []struct {
		e, p, f, x int
		want       string
	}{{0, 0, 0, 0, "stop_insufficient"}, {2, 1, 1, 0, "technical_no_go_local_shape"}, {2, 1, 0, 1, "stop_insufficient"}, {1, 1, 0, 0, "technical_go_local_shape_local_only"}, {2, 2, 0, 0, "technical_go_local_shape"}} {
		if got := decision(tc.e, tc.p, tc.f, tc.x); got != tc.want {
			t.Fatalf("%+v: %s", tc, got)
		}
	}
	a, err := syntheticManifest()
	if err != nil {
		t.Fatal(err)
	}
	b, err := syntheticManifest()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a, b) {
		t.Fatal("nondeterministic")
	}
	if bytes.Contains(a, []byte("centerline")) || bytes.Contains(a, []byte("track-a")) || bytes.Contains(a, []byte("p95")) || bytes.Contains(a, []byte("commitment")) {
		t.Fatalf("privacy leak: %s", a)
	}
}
func TestSyntheticExactIndependentJSON(t *testing.T) {
	got, err := syntheticManifest()
	if err != nil {
		t.Fatal(err)
	}
	const want = `{
  "version": "ta04f7/v1",
  "protocol_sha": "7d239baae99cc0f51911bc2fae1b0a1dac1cc0b3",
  "runner_sha": "synthetic",
  "outcome": "analysis_complete",
  "inventory_stable": true,
  "population": {
    "inventory_candidates": 3,
    "duplicates": 0,
    "authorization_rejected": 0,
    "stability_rejected": 0,
    "artifact_guard_rejected": 0,
    "data_invalid": 0,
    "canonical_recordings": 3,
    "insufficient_laps_recordings": 0,
    "eligible_recordings": 3
  },
  "groups": [
    {
      "group_ordinal": 1,
      "discovered_recordings": 2,
      "insufficient_laps_recordings": 0,
      "eligible_recordings": 2,
      "contributing_recordings": 2,
      "passing_recordings": 2,
      "failing_recordings": 0,
      "crossfit_insufficient_recordings": 0,
      "evaluated_slots": 5,
      "passed_slots": 5,
      "failed_threshold_slots": 0,
      "failed_eval_geometry_slots": 0,
      "failed_training_fold_slots": 0,
      "decision": "technical_go_local_shape",
      "cross_recording_confidence": "limited"
    },
    {
      "group_ordinal": 2,
      "discovered_recordings": 1,
      "insufficient_laps_recordings": 0,
      "eligible_recordings": 1,
      "contributing_recordings": 1,
      "passing_recordings": 1,
      "failing_recordings": 0,
      "crossfit_insufficient_recordings": 0,
      "evaluated_slots": 2,
      "passed_slots": 2,
      "failed_threshold_slots": 0,
      "failed_eval_geometry_slots": 0,
      "failed_training_fold_slots": 0,
      "decision": "technical_go_local_shape_local_only",
      "cross_recording_confidence": "none"
    }
  ],
  "cleanup": {
    "open_readers": 0,
    "staging_entries": 0,
    "staging_roots": 0
  },
  "local_shape": "unknown",
  "product_map_authorization": false
}
`
	if string(got) != want {
		t.Fatalf("synthetic mismatch\n%s", got)
	}
}

func TestResourceAccountantAndRetention(t *testing.T) {
	r := ResourceAccountant{}
	if err := r.Add(logicalLimit); err != nil {
		t.Fatal(err)
	}
	if r.Add(1) == nil {
		t.Fatal("cap")
	}
	if _, ok := checkedMul(^uint64(0), 2); ok {
		t.Fatal("overflow")
	}
	s := Retention{}
	if err := s.Begin(); err != nil {
		t.Fatal(err)
	}
	if s.Begin() == nil {
		t.Fatal("two recordings retained")
	}
	s.Release()
	if s.Live {
		t.Fatal("not released")
	}
}
