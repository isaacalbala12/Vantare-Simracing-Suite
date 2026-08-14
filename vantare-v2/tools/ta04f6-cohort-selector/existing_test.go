package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type fakeExistingBackend struct {
	steps                                  []string
	candidates                             []ExistingCandidateV1
	processed                              map[string]ProcessedCandidateV1
	processErr                             map[string]error
	cleanupErr                             error
	ledger                                 CleanupLedgerV1
	preflightErr, errorSynthetic, readyErr error
}

type orderedCloserV1 struct {
	steps *[]string
	err   error
}

func (c orderedCloserV1) Close() error { *c.steps = append(*c.steps, "close"); return c.err }

func (f *fakeExistingBackend) Preflight(context.Context, ExistingConfigV1) error {
	f.steps = append(f.steps, "preflight")
	return f.preflightErr
}
func (f *fakeExistingBackend) SyntheticControls() error {
	f.steps = append(f.steps, "synthetic")
	if f.errorSynthetic != nil {
		return f.errorSynthetic
	}
	_, err := RunSyntheticV1()
	return err
}
func (f *fakeExistingBackend) Ready(context.Context) ([]ExistingCandidateV1, error) {
	f.steps = append(f.steps, "discovery")
	if f.readyErr != nil {
		return nil, f.readyErr
	}
	return append([]ExistingCandidateV1(nil), f.candidates...), nil
}
func (f *fakeExistingBackend) Process(_ context.Context, c ExistingCandidateV1, _ [32]byte) (ProcessedCandidateV1, error) {
	f.steps = append(f.steps, "process:"+c.Token)
	if err := f.processErr[c.Token]; err != nil {
		return ProcessedCandidateV1{}, err
	}
	return f.processed[c.Token], nil
}
func (f *fakeExistingBackend) CleanupRoot() error {
	f.steps = append(f.steps, "cleanup-root")
	return f.cleanupErr
}
func (f *fakeExistingBackend) Ledger() CleanupLedgerV1 { return f.ledger }

func TestExistingPreflightRunsBeforeDiscovery(t *testing.T) {
	b := &fakeExistingBackend{ledger: CleanupLedgerV1{}}
	_, err := runExistingWithBackend(context.Background(), ExistingConfigV1{}, b, bytes.NewReader(make([]byte, 32)))
	if err == nil {
		t.Fatal("invalid empty population should fail after discovery")
	}
	if strings.Join(b.steps, ",") != "preflight,synthetic,discovery,cleanup-root" {
		t.Fatalf("steps=%v", b.steps)
	}
}

func TestExistingCompleteAndStopOutcomes(t *testing.T) {
	key := GroupKeyV1{"algarve international circuit", "gp", "car", "class"}
	processed := map[string]ProcessedCandidateV1{}
	var candidates []ExistingCandidateV1
	for i := 0; i < 10; i++ {
		token := string(rune('a' + i))
		candidates = append(candidates, ExistingCandidateV1{Token: token, Sort: CandidateV1{Locator: token}})
		r := goldenRecording(t)
		r.Group = key
		processed[token] = ProcessedCandidateV1{Algarve: true, SessionID: "session-" + token, Recording: &r}
	}
	for groupIndex, count := range []int{3, 1, 1, 1} {
		for i := 0; i < count; i++ {
			token := string(rune('k' + len(candidates) - 10))
			candidates = append(candidates, ExistingCandidateV1{Token: token, Sort: CandidateV1{Locator: token}})
			r := goldenRecording(t)
			r.Group = GroupKeyV1{"portimao", "layout", "car-" + string(rune('a'+groupIndex)), "class"}
			processed[token] = ProcessedCandidateV1{Algarve: true, SessionID: "session-" + token, Recording: &r}
		}
	}
	b := &fakeExistingBackend{candidates: candidates, processed: processed}
	manifest, err := runExistingWithBackend(context.Background(), ExistingConfigV1{ProtocolSHA: protocolSHA, RunnerSHA: strings.Repeat("a", 40)}, b, bytes.NewReader(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	if manifest.Outcome != "cohort_frozen" || manifest.SelectedRecordings != 10 || manifest.SelectedLaps != 120 || len(manifest.RecordingCommitments) != 10 || len(manifest.LapCommitments) != 120 {
		t.Fatalf("manifest=%+v", manifest)
	}
	if manifest.CommitKey == "" || len(manifest.SerializationCommitments) != 10 {
		t.Fatalf("frozen manifest omitted commitments: %+v", manifest)
	}
	encoded, _ := json.Marshal(manifest)
	for _, sentinel := range []string{"session-a", "algarve international circuit", "C:\\private", "40.001", "-8.001"} {
		if strings.Contains(string(encoded), sentinel) {
			t.Fatalf("manifest leaked %q", sentinel)
		}
	}

	stopProcessed := map[string]ProcessedCandidateV1{}
	var stopCandidates []ExistingCandidateV1
	for token, item := range processed {
		r := *item.Recording
		r.LapEvents.Events = r.LapEvents.Events[:1]
		stopCandidates = append(stopCandidates, ExistingCandidateV1{Token: token, Sort: CandidateV1{Locator: token}})
		stopProcessed[token] = ProcessedCandidateV1{Algarve: true, SessionID: item.SessionID, Recording: &r}
	}
	stop := &fakeExistingBackend{candidates: stopCandidates, processed: stopProcessed}
	manifest, err = runExistingWithBackend(context.Background(), ExistingConfigV1{}, stop, bytes.NewReader(make([]byte, 32)))
	if err != nil || manifest.Outcome != "stop_insufficient" {
		t.Fatalf("manifest=%+v err=%v", manifest, err)
	}
	stopJSON, _ := json.Marshal(manifest)
	for _, forbidden := range []string{"commit_key", "commitments", "group_digest", "temporaries"} {
		if strings.Contains(string(stopJSON), forbidden) {
			t.Fatalf("stop manifest contains %q: %s", forbidden, stopJSON)
		}
	}
	if len(manifest.Groups) == 0 || manifest.Groups[0].GroupOrdinal != "group_1" || manifest.Groups[0].CenterPresent {
		t.Fatalf("group evidence=%+v", manifest.Groups)
	}
}

func TestExistingGuardRejectionStillConservesAlgarvePopulation(t *testing.T) {
	b := completeExistingBackendV1(t)
	bad := b.processed["a"]
	bad.Recording.LapDist.Samples[2].Index++
	b.processed["a"] = bad
	manifest, err := runExistingWithBackend(context.Background(), ExistingConfigV1{}, b, bytes.NewReader(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	if manifest.AlgarveRecordings != 16 || manifest.OracleEvaluable+manifest.LowEvent+manifest.OracleInvalid != 16 || manifest.DataInvalid != 1 || manifest.GuardRejected != 1 {
		t.Fatalf("manifest=%+v", manifest)
	}
	groupRejects := 0
	for _, group := range manifest.Groups {
		groupRejects += group.GuardRejected
		if group.GuardRejected != group.DataInvalid {
			t.Fatalf("group rejection mismatch: %+v", group)
		}
	}
	if groupRejects != manifest.GuardRejected {
		t.Fatalf("group rejects=%d global=%d", groupRejects, manifest.GuardRejected)
	}
	group := manifest.Groups[0].Population
	if group.Recordings != 10 || group.OracleEvaluable != 10 {
		t.Fatalf("group=%+v", group)
	}
}

func TestGroupEvidenceCenterGateAndPostfilter(t *testing.T) {
	group := GroupKeyV1{"track", "layout", "car", "class"}
	digest := groupDigestV1(group)
	makeResult := func(count int, length float64) RecordingResultV1 {
		laps := make([]LapV1, count)
		for i := range laps {
			laps[i] = LapV1{TotalLength: length}
		}
		return RecordingResultV1{Group: group, GroupDigest: digest, Population: PopulationEvaluable, PreliminaryLaps: laps, RecordingMedian: length}
	}
	key := hex.EncodeToString(digest[:])
	pop := map[string]PopulationCountsV1{key: {Recordings: 7, OracleEvaluable: 7}}
	results := []RecordingResultV1{makeResult(9, 1), makeResult(9, 1), makeResult(9, 1), makeResult(9, 1), makeResult(9, 1), makeResult(12, 1), makeResult(12, 1)}
	for i := range results {
		results[i].RecordingToken = string(rune('a' + i))
	}
	cohort, valid, evaluations, err := evaluateGroupsV1(results)
	if err != nil || valid != 0 || len(cohort.Recordings) != 0 {
		t.Fatalf("69-lap evaluation cohort=%+v valid=%d err=%v", cohort, valid, err)
	}
	e := buildGroupEvidenceV1(evaluations, pop, nil)[0]
	if e.Recordings != 7 || e.ContributorsPreliminaryGE10 != 2 || e.CenterPresent || e.EligiblePostfilterGE10 != 0 || len(e.PostfilterCountHistogram) != 0 {
		t.Fatalf("69-lap evidence=%+v", e)
	}
	if got := histogramTotalV1(e.PreliminaryCountHistogram); got != 69 {
		t.Fatalf("preliminary histogram total=%d", got)
	}
	if histogramRecordingsV1(e.PreliminaryCountHistogram) != e.Recordings || e.Population.Recordings != e.Recordings {
		t.Fatalf("non-conservative 69-lap evidence=%+v", e)
	}

	results = []RecordingResultV1{makeResult(12, 1), makeResult(12, 1), makeResult(12, 100)}
	for i := range results {
		results[i].RecordingToken = string(rune('a' + i))
	}
	pop[key] = PopulationCountsV1{Recordings: 3, OracleEvaluable: 3}
	cohort, valid, evaluations, err = evaluateGroupsV1(results)
	e = buildGroupEvidenceV1(evaluations, pop, nil)[0]
	if !e.CenterPresent || e.ContributorsPreliminaryGE10 != 3 || e.EligiblePostfilterGE10 != 2 || histogramTotalV1(e.PostfilterCountHistogram) != 24 {
		t.Fatalf("postfilter evidence=%+v", e)
	}
	if err != nil || valid != 24 || len(cohort.Recordings) != 0 {
		t.Fatalf("postfilter case did not stop: cohort=%+v err=%v", cohort, err)
	}
}

func histogramTotalV1(histogram []CountHistogramV1) int {
	total := 0
	for _, bin := range histogram {
		total += bin.Count * bin.Recordings
	}
	return total
}

func histogramRecordingsV1(histogram []CountHistogramV1) int {
	total := 0
	for _, bin := range histogram {
		total += bin.Recordings
	}
	return total
}

func TestRejectWithFabricatedLapsCannotQualify(t *testing.T) {
	b := completeExistingBackendV1(t)
	for token, item := range b.processed {
		item.Reject = "data_invalid"
		b.processed[token] = item
	}
	manifest, err := runExistingWithBackend(context.Background(), ExistingConfigV1{}, b, bytes.NewReader(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	if manifest.Outcome != "stop_insufficient" {
		t.Fatalf("rejected recordings qualified: %+v", manifest)
	}
	groupRejects := 0
	for _, group := range manifest.Groups {
		groupRejects += group.GuardRejected
	}
	if groupRejects != 16 || manifest.GuardRejected != 16 || manifest.DataInvalid != 16 {
		t.Fatalf("reject ledger not conserved: %+v", manifest)
	}
}

func completeExistingBackendV1(t *testing.T) *fakeExistingBackend {
	t.Helper()
	key := GroupKeyV1{"algarve international circuit", "gp", "car", "class"}
	processed := map[string]ProcessedCandidateV1{}
	var candidates []ExistingCandidateV1
	for i := 0; i < 10; i++ {
		token := string(rune('a' + i))
		candidates = append(candidates, ExistingCandidateV1{Token: token, Sort: CandidateV1{Locator: token}})
		r := goldenRecording(t)
		r.Group = key
		processed[token] = ProcessedCandidateV1{Algarve: true, SessionID: "session-" + token, Recording: &r}
	}
	for groupIndex, count := range []int{3, 1, 1, 1} {
		for i := 0; i < count; i++ {
			token := string(rune('k' + len(candidates) - 10))
			candidates = append(candidates, ExistingCandidateV1{Token: token, Sort: CandidateV1{Locator: token}})
			r := goldenRecording(t)
			r.Group = GroupKeyV1{"portimao", "layout", "car-" + string(rune('a'+groupIndex)), "class"}
			processed[token] = ProcessedCandidateV1{Algarve: true, SessionID: "session-" + token, Recording: &r}
		}
	}
	return &fakeExistingBackend{candidates: candidates, processed: processed}
}

func TestExistingFailureStillCleansRootAndPublishesNoPartial(t *testing.T) {
	b := &fakeExistingBackend{
		candidates: []ExistingCandidateV1{{Token: "one"}},
		processErr: map[string]error{"one": errors.New("private sentinel")},
	}
	manifest, err := runExistingWithBackend(context.Background(), ExistingConfigV1{}, b, bytes.NewReader(make([]byte, 32)))
	if err == nil || manifest.Outcome != "" {
		t.Fatalf("manifest=%+v err=%v", manifest, err)
	}
	if strings.Join(b.steps, ",") != "preflight,synthetic,discovery,process:one,cleanup-root" {
		t.Fatalf("steps=%v", b.steps)
	}
}

func TestCompositionAndAlgarveFilterFailClosed(t *testing.T) {
	if !isAlgarveV1(GroupKeyV1{TrackName: "  AUTÓDROMO   Internacional do Algarve "}) {
		t.Fatal("alias rejected")
	}
	if isAlgarveV1(GroupKeyV1{TrackName: "Algarve club"}) {
		t.Fatal("invented alias")
	}
	if !validAlgarveCompositionV1([]int{1, 10, 1, 3, 1}) {
		t.Fatal("valid composition rejected")
	}
	if validAlgarveCompositionV1([]int{10, 3, 1, 1}) {
		t.Fatal("changed composition accepted")
	}
}

func TestAtomicOutputRejectsExistingAndLeavesNoTemporary(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "freeze.md")
	if err := writeAtomicExclusiveV1(target, []byte("safe")); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(target); string(got) != "safe" {
		t.Fatalf("got=%q", got)
	}
	if err := writeAtomicExclusiveV1(target, []byte("overwrite")); err == nil {
		t.Fatal("overwrite accepted")
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("entries=%v err=%v", entries, err)
	}
}

type fakeAtomicFileV1 struct{ syncErr, closeErr error }

func (*fakeAtomicFileV1) Write(p []byte) (int, error) { return len(p), nil }
func (f *fakeAtomicFileV1) Sync() error               { return f.syncErr }
func (f *fakeAtomicFileV1) Close() error              { return f.closeErr }

type fakeAtomicFSV1 struct {
	checks           int
	file             *fakeAtomicFileV1
	renameErr        error
	removed, renamed bool
	reparseAt        int
}

func (f *fakeAtomicFSV1) Validate(string) error {
	f.checks++
	if f.checks == f.reparseAt {
		return invalid()
	}
	return nil
}
func (f *fakeAtomicFSV1) OpenExclusive(string) (atomicFileV1, error) { return f.file, nil }
func (f *fakeAtomicFSV1) Rename(string, string) error                { f.renamed = true; return f.renameErr }
func (f *fakeAtomicFSV1) Remove(string) error                        { f.removed = true; return nil }
func TestAtomicOutputRevalidatesAncestorsAndCleansEveryFailure(t *testing.T) {
	for name, fs := range map[string]*fakeAtomicFSV1{
		"sync":                  {file: &fakeAtomicFileV1{syncErr: errors.New("sync")}},
		"close":                 {file: &fakeAtomicFileV1{closeErr: errors.New("close")}},
		"reparse-before-rename": {file: &fakeAtomicFileV1{}, reparseAt: 2},
		"rename":                {file: &fakeAtomicFileV1{}, renameErr: errors.New("rename")},
	} {
		t.Run(name, func(t *testing.T) {
			if err := writeAtomicExclusiveWithFSV1(`C:\safe\freeze.md`, []byte("safe"), fs, bytes.NewReader(make([]byte, 16))); err == nil {
				t.Fatal("failure accepted")
			}
			if !fs.removed {
				t.Fatal("temporary not removed")
			}
			if name == "reparse-before-rename" && fs.renamed {
				t.Fatal("renamed after reparse")
			}
		})
	}
}

func TestCloseAlwaysPrecedesCleanupAndCleanupContinuesAfterCloseError(t *testing.T) {
	steps := []string{}
	ledger := CleanupLedgerV1{OpenReaders: 1, StagingEntries: 1}
	err := closeThenCleanupV1(orderedCloserV1{steps: &steps, err: errors.New("close")}, func() error { steps = append(steps, "cleanup"); return nil }, &ledger, nil)
	if err == nil || strings.Join(steps, ",") != "close,cleanup" || ledger.OpenReaders != 0 || ledger.StagingEntries != 0 {
		t.Fatalf("steps=%v ledger=%+v err=%v", steps, ledger, err)
	}
}

func TestExistingBudgetsFailClosedWithoutPartialManifest(t *testing.T) {
	tooMany := &fakeExistingBackend{candidates: make([]ExistingCandidateV1, maxReadyCandidates+1)}
	if manifest, err := runExistingWithBackend(context.Background(), ExistingConfigV1{}, tooMany, bytes.NewReader(make([]byte, 32))); err == nil || manifest.Outcome != "" {
		t.Fatalf("candidate budget manifest=%+v err=%v", manifest, err)
	}
	tooLarge := &fakeExistingBackend{candidates: []ExistingCandidateV1{{Token: "large", Sort: CandidateV1{Size: maxStagedBytes + 1}}}}
	if manifest, err := runExistingWithBackend(context.Background(), ExistingConfigV1{}, tooLarge, bytes.NewReader(make([]byte, 32))); err == nil || manifest.Outcome != "" {
		t.Fatalf("byte budget manifest=%+v err=%v", manifest, err)
	}
}

func TestValidLapsCountsOnlyGroupsWithCenter(t *testing.T) {
	b := completeExistingBackendV1(t)
	manifest, err := runExistingWithBackend(context.Background(), ExistingConfigV1{}, b, bytes.NewReader(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	if manifest.SelectedLaps != 120 || manifest.ValidLaps != 156 {
		t.Fatalf("selected=%d valid=%d", manifest.SelectedLaps, manifest.ValidLaps)
	}
}

func TestExistingPhaseErrorsDoNotPublishAndCleanupAfterPreflight(t *testing.T) {
	for name, b := range map[string]*fakeExistingBackend{
		"preflight": {preflightErr: errors.New("sentinel")},
		"synthetic": {errorSynthetic: errors.New("sentinel")},
		"discovery": {readyErr: errors.New("sentinel")},
	} {
		t.Run(name, func(t *testing.T) {
			manifest, err := runExistingWithBackend(context.Background(), ExistingConfigV1{}, b, bytes.NewReader(make([]byte, 32)))
			if err == nil || manifest.Outcome != "" {
				t.Fatalf("manifest=%+v err=%v", manifest, err)
			}
			joined := strings.Join(b.steps, ",")
			if strings.Contains(joined, "discovery") && name != "discovery" {
				t.Fatalf("steps=%s", joined)
			}
			if name == "preflight" && joined != "preflight" {
				t.Fatalf("steps=%s", joined)
			}
			if name != "preflight" && !strings.HasSuffix(joined, "cleanup-root") {
				t.Fatalf("cleanup missing: %s", joined)
			}
		})
	}
}
