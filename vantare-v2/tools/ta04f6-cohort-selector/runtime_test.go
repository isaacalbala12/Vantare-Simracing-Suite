package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"path/filepath"
	"strings"
	"testing"
)

func TestCommitmentsAreDomainSeparatedAndDeterministic(t *testing.T) {
	var key [32]byte
	for i := range key {
		key[i] = byte(i)
	}
	r := goldenRecording(t)
	serialized, err := SerializeV1(r)
	if err != nil {
		t.Fatal(err)
	}
	a := BuildCommitmentsV1(key, "session-a", serialized, 0, 1)
	again := BuildCommitmentsV1(key, "session-a", serialized, 0, 1)
	if a != again {
		t.Fatal("same run changed commitments")
	}
	b := BuildCommitmentsV1(key, "session-b", serialized, 0, 1)
	if a.Recording == b.Recording {
		t.Fatal("recording identity not bound")
	}
	c := BuildCommitmentsV1(key, "session-a", append(serialized, 0), 0, 1)
	if a.Serialization == c.Serialization {
		t.Fatal("serialization not bound")
	}
	d := BuildCommitmentsV1(key, "session-a", serialized, 1, 2)
	if a.Lap == d.Lap {
		t.Fatal("lap ordinals not bound")
	}
}

func TestSerializationCommitmentsReleasePayloadImmediately(t *testing.T) {
	r := goldenRecording(t)
	var key [32]byte
	ledger := &serializationRetentionV1{}
	pending, err := commitRecordingV1(key, "session", r, ledger)
	if err != nil {
		t.Fatal(err)
	}
	serialized, err := SerializeV1(r)
	if err != nil {
		t.Fatal(err)
	}
	expected := BuildCommitmentsV1(key, "session", serialized, 0, 0)
	if pending.Recording != expected.Recording || pending.Serialization != expected.Serialization || ledger.CurrentBytes != 0 || ledger.MaxBuffers > 1 {
		t.Fatalf("pending=%+v ledger=%+v", pending, ledger)
	}
	lap := BuildLapCommitmentV1(key, pending.Recording, 2, 3)
	old := BuildCommitmentsV1(key, "session", serialized, 2, 3)
	if lap != old.Lap {
		t.Fatal("lap commitment changed")
	}
}

func TestPagingRequiresExactStartsContinuityAndShortEOF(t *testing.T) {
	calls := 0
	got, err := CollectPagesV1(context.Background(), maxNumericChannelSamples, func(start, limit int) (PageV1, error) {
		calls++
		n := limit
		if start == 8192 {
			n = 3
		}
		samples := make([]SampleV1, n)
		for i := range samples {
			samples[i] = SampleV1{Index: int64(start + i), Value: float64(start + i), Quality: "valid"}
		}
		return PageV1{Start: start, Samples: samples}, nil
	})
	if err != nil || len(got) != 8195 || calls != 3 {
		t.Fatalf("got=%d calls=%d err=%v", len(got), calls, err)
	}
	_, err = CollectPagesV1(context.Background(), maxNumericChannelSamples, func(start, limit int) (PageV1, error) { return PageV1{Start: start + 1}, nil })
	if !IsCode(err, CodeDataInvalid) {
		t.Fatalf("wrong start: %v", err)
	}
	_, err = CollectPagesV1(context.Background(), maxNumericChannelSamples, func(start, limit int) (PageV1, error) {
		return PageV1{Start: start, Samples: []SampleV1{{Index: int64(start + 1), Value: 1, Quality: "valid"}}}, nil
	})
	if !IsCode(err, CodeDataInvalid) {
		t.Fatalf("gap: %v", err)
	}
}

func TestPagingFailsClosedAtCapAndCancellation(t *testing.T) {
	_, err := CollectPagesV1(context.Background(), 4096, func(start, limit int) (PageV1, error) {
		samples := make([]SampleV1, limit)
		for i := range samples {
			samples[i] = SampleV1{Index: int64(start + i), Value: 1, Quality: "valid"}
		}
		return PageV1{Start: start, Samples: samples}, nil
	})
	if !IsCode(err, CodeDataInvalid) {
		t.Fatalf("endless cap: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	_, err = CollectPagesV1(ctx, 100, func(start, limit int) (PageV1, error) {
		calls++
		cancel()
		return PageV1{Start: start, Samples: []SampleV1{{Index: int64(start), Value: 1, Quality: "valid"}}}, nil
	})
	if err != context.Canceled || calls != 1 {
		t.Fatalf("cancel after callback: calls=%d err=%v", calls, err)
	}
	cancelled, cancelNow := context.WithCancel(context.Background())
	cancelNow()
	calls = 0
	_, err = CollectPagesV1(cancelled, 100, func(start, limit int) (PageV1, error) { calls++; return PageV1{}, nil })
	if err != context.Canceled || calls != 0 {
		t.Fatalf("cancel before callback: calls=%d err=%v", calls, err)
	}
	if _, err := CollectPagesV1(context.Background(), int(^uint(0)>>1), func(start, limit int) (PageV1, error) { return PageV1{}, nil }); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("oversized maxRows: %v", err)
	}
}

func TestSyntheticGoldenAggregateIsDeterministicAndSanitized(t *testing.T) {
	a, err := RunSyntheticV1()
	if err != nil {
		t.Fatal(err)
	}
	b, err := RunSyntheticV1()
	if err != nil || !bytes.Equal(a, b) {
		t.Fatalf("nondeterministic: %v", err)
	}
	var got AggregateV1
	if err := json.Unmarshal(a, &got); err != nil {
		t.Fatal(err)
	}
	if got.Recordings != 8 || got.OracleEvaluable != 8 || got.Resets != 104 || got.Boundaries != 104 || got.Matches != 104 || got.PreliminaryWindows != 96 || got.ValidLaps != 96 || got.SelectedRecordings != 3 || got.SelectedLaps != 36 || got.Center != 1 || got.Outcome != "cohort_frozen" {
		t.Fatalf("aggregate %+v", got)
	}
	for _, secret := range []string{"session-a", "C:\\private", "40.001", "-8.001", "27.25"} {
		if strings.Contains(string(a), secret) {
			t.Fatalf("leaked %q", secret)
		}
	}
}

func TestCLIRejectsRealModeWithoutInstantiatingData(t *testing.T) {
	var out, stderr bytes.Buffer
	code := runCLI([]string{"-mode=existing-authorized"}, &out, &stderr)
	if code == 0 || !strings.Contains(stderr.String(), string(CodeDataInvalid)) {
		t.Fatalf("code=%d stderr=%s", code, stderr.String())
	}
	if code := runCLI(nil, &out, &stderr); code != 0 {
		t.Fatalf("default synthetic code=%d", code)
	}
}

func TestCLIParseErrorsNeverLeakFlagInputOrUsage(t *testing.T) {
	for _, args := range [][]string{{"-unknown=C:\\private\\sentinel.duckdb"}, {"-mode"}, {"-h"}, {"-mode=existing-authorized", "-output=C:\\private\\sentinel.md"}} {
		var out, stderr bytes.Buffer
		code := runCLI(args, &out, &stderr)
		if code == 0 || stderr.String() != string(CodeDataInvalid)+"\n" || out.Len() != 0 || strings.Contains(stderr.String(), "Usage") {
			t.Fatalf("args=%v code=%d out=%q err=%q", args, code, out.String(), stderr.String())
		}
	}
}

func TestCLIRealFlagsUseExactAbsoluteOutputBeforeBackendAndWrite(t *testing.T) {
	args := []string{"-mode=existing-authorized", "-protocol-sha=" + protocolSHA, "-runner-sha=" + strings.Repeat("a", 40), "-output=" + expectedOutputPath}
	backend := &fakeExistingBackend{}
	var gotConfig ExistingConfigV1
	var wrote string
	projectDir := filepath.Clean(filepath.Join(filepath.Dir(expectedOutputPath), "..", "..", "..", ".."))
	getwd := func() (string, error) { return projectDir, nil }
	code := runCLIWithDeps(args, io.Discard, io.Discard, func(_ string) existingBackendV1 {
		backend.preflightErr = errors.New("controlled stop")
		return &capturingBackendV1{existingBackendV1: backend, config: &gotConfig}
	}, func(path string, _ []byte) error { wrote = path; return nil }, getwd)
	if code != 1 || gotConfig.OutputPath != expectedOutputPath || wrote != "" || strings.Join(backend.steps, ",") != "preflight" {
		t.Fatalf("code=%d config=%+v wrote=%q steps=%v", code, gotConfig, wrote, backend.steps)
	}
	backend = completeExistingBackendV1(t)
	code = runCLIWithDeps(args, io.Discard, io.Discard, func(_ string) existingBackendV1 { return backend }, func(path string, _ []byte) error { wrote = path; return nil }, getwd)
	if code != 0 || wrote != expectedOutputPath {
		t.Fatalf("code=%d wrote=%q", code, wrote)
	}
}

type capturingBackendV1 struct {
	existingBackendV1
	config *ExistingConfigV1
}

func (b *capturingBackendV1) Preflight(ctx context.Context, cfg ExistingConfigV1) error {
	*b.config = cfg
	return b.existingBackendV1.Preflight(ctx, cfg)
}

func TestCLIRejectsNonCanonicalRealOutputBeforeBackend(t *testing.T) {
	projectDir := filepath.Clean(filepath.Join(filepath.Dir(expectedOutputPath), "..", "..", "..", ".."))
	canonicalRelative := filepath.Join("docs", "vantare-program", "research", "telemetry-analysis", "ta04f6-selection-freeze.md")
	for _, output := range []string{
		canonicalRelative,
		filepath.Join("docs", "ta04f6-selection-freeze.md"),
		filepath.Join("docs", "..", "ta04f6-selection-freeze.md"),
		filepath.Join("docs", "vantare-program", "research", "telemetry-analysis") + string(filepath.Separator) + ".." + string(filepath.Separator) + "telemetry-analysis" + string(filepath.Separator) + "ta04f6-selection-freeze.md",
		strings.Replace(canonicalRelative, "telemetry-analysis", "Telemetry-Analysis", 1),
	} {
		called := false
		args := []string{"-mode=existing-authorized", "-protocol-sha=" + protocolSHA, "-runner-sha=" + strings.Repeat("a", 40), "-output=" + output}
		if code := runCLIWithDeps(args, io.Discard, io.Discard, func(string) existingBackendV1 { called = true; return &fakeExistingBackend{} }, writeAtomicExclusiveV1, func() (string, error) { return projectDir, nil }); code != 2 || called {
			t.Fatalf("output=%q code=%d called=%v", output, code, called)
		}
	}
}

func TestPopulationLedgerConservesGloballyAndPerDigest(t *testing.T) {
	var a, b [32]byte
	a[0], b[0] = 1, 2
	results := []RecordingResultV1{{GroupDigest: a, Population: PopulationLowEvent}, {GroupDigest: a, Population: PopulationInvalid}, {GroupDigest: a, Population: PopulationEvaluable}, {GroupDigest: b, Population: PopulationEvaluable}}
	ledger, err := BuildPopulationLedgerV1(results)
	if err != nil {
		t.Fatal(err)
	}
	if ledger.Total.Recordings != 4 || ledger.ByDigest[a].Recordings != 3 || ledger.ByDigest[b].Recordings != 1 {
		t.Fatalf("ledger %+v", ledger)
	}
}

func TestEligibleRecordingsRequireOpaqueToken(t *testing.T) {
	r := goldenRecording(t)
	got, err := ClassifyV1(r)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := SelectCohortV1([]RecordingResultV1{got, got, got}); !IsCode(err, CodeDataInvalid) {
		t.Fatalf("empty tokens: %v", err)
	}
}
