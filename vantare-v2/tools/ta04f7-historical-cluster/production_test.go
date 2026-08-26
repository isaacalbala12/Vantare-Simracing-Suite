package main

import (
	"context"
	"errors"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/duckdbadapter"
	"testing"
)

func TestGitPreflightAcceptsGitForWindowsRootSeparators(t *testing.T) {
	if !sameGit(`C:/repo/worktree`, `C:\repo\worktree`) {
		t.Fatal("Git for Windows root separators must compare as the same path")
	}
}

type orderedCloser struct {
	calls *[]string
	err   error
}
type fakeProductionReader struct {
	calls        *[]string
	handshakeErr error
}

func (r *fakeProductionReader) Handshake(context.Context) error {
	*r.calls = append(*r.calls, "handshake")
	return r.handshakeErr
}
func (r *fakeProductionReader) Close() error { *r.calls = append(*r.calls, "close"); return nil }

type failingHistoricalParser struct{}

func (failingHistoricalParser) Inspect(context.Context) (telemetryanalysis.HistoricalSession, error) {
	return telemetryanalysis.HistoricalSession{}, errors.New("inspect")
}
func (failingHistoricalParser) ReadPage(context.Context, string, int64, int) (telemetryanalysis.HistoricalPage, error) {
	return telemetryanalysis.HistoricalPage{}, errors.New("page")
}
func TestProductionOpsPhaseFailuresStopAndCleanup(t *testing.T) {
	for _, phase := range []string{"authorize", "stage", "load", "reader", "handshake", "parser", "inspect"} {
		calls := []string{}
		b := newProductionBackend("x")
		b.actual["opaque"] = telemetryanalysis.Candidate{}
		b.stagingRoot = "x"
		b.ops.authorize = func(context.Context, telemetryanalysis.ContentSource, telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedHistoricalArtifact, error) {
			calls = append(calls, "authorize")
			if phase == "authorize" {
				return telemetryanalysis.AuthorizedHistoricalArtifact{}, errors.New("x")
			}
			return telemetryanalysis.AuthorizedHistoricalArtifact{}, nil
		}
		b.ops.stage = func(context.Context, telemetryanalysis.ContentSource, telemetryanalysis.Candidate, telemetryanalysis.AuthorizedHistoricalArtifact, string) (telemetryanalysis.StagedHistoricalArtifact, error) {
			calls = append(calls, "stage")
			if phase == "stage" {
				return telemetryanalysis.StagedHistoricalArtifact{}, errors.New("x")
			}
			return telemetryanalysis.StagedHistoricalArtifact{}, nil
		}
		b.ops.load = func(string) (duckdbadapter.Runtime, error) {
			calls = append(calls, "load")
			if phase == "load" {
				return duckdbadapter.Runtime{}, errors.New("x")
			}
			return duckdbadapter.Runtime{}, nil
		}
		b.ops.reader = func(duckdbadapter.Runtime, telemetryanalysis.AuthorizedHistoricalArtifact, telemetryanalysis.StagedHistoricalArtifact) (productionReaderV1, error) {
			calls = append(calls, "reader")
			if phase == "reader" {
				return nil, errors.New("x")
			}
			r := &fakeProductionReader{calls: &calls}
			if phase == "handshake" {
				r.handshakeErr = errors.New("x")
			}
			return r, nil
		}
		b.ops.parser = func(telemetryanalysis.AuthorizedHistoricalArtifact, productionReaderV1) (historicalParser, error) {
			calls = append(calls, "parser")
			if phase == "parser" {
				return nil, errors.New("x")
			}
			return failingHistoricalParser{}, nil
		}
		_, _ = b.Process(context.Background(), InventoryItem{ID: "opaque"})
		if phase == "handshake" || phase == "parser" || phase == "inspect" {
			if calls[len(calls)-1] != "close" || b.ledger.OpenReaders != 0 || b.ledger.StagingEntries != 0 {
				t.Fatalf("phase=%s calls=%v ledger=%+v", phase, calls, b.ledger)
			}
		}
	}
}
func TestKnownAuthorizationErrorClassifiesButUnknownPropagates(t *testing.T) {
	for _, tc := range []struct {
		err   error
		class string
	}{{telemetryanalysis.ErrNotReady, "authorization"}, {errors.New("unexpected sentinel"), ""}} {
		b := newProductionBackend("x")
		b.actual["opaque"] = telemetryanalysis.Candidate{}
		b.ops.authorize = func(context.Context, telemetryanalysis.ContentSource, telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedHistoricalArtifact, error) {
			return telemetryanalysis.AuthorizedHistoricalArtifact{}, tc.err
		}
		got, err := b.Process(context.Background(), InventoryItem{ID: "opaque"})
		if tc.class != "" {
			if err != nil || got.Class != tc.class {
				t.Fatalf("known %+v %v", got, err)
			}
		} else if err == nil {
			t.Fatal("unknown swallowed")
		}
	}
}

func (c orderedCloser) Close() error { *c.calls = append(*c.calls, "close"); return c.err }
func TestCloseAlwaysPrecedesCleanupAndLedgerReachesZero(t *testing.T) {
	for _, closeErr := range []error{nil, errors.New("close")} {
		calls := []string{}
		ledger := Cleanup{OpenReaders: 1, StagingEntries: 1}
		err := closeCleanup(orderedCloser{&calls, closeErr}, func() error { calls = append(calls, "cleanup"); return nil }, &ledger, nil)
		if len(calls) != 2 || calls[0] != "close" || calls[1] != "cleanup" || ledger.OpenReaders != 0 || ledger.StagingEntries != 0 {
			t.Fatalf("calls=%v ledger=%+v", calls, ledger)
		}
		if closeErr != nil && err == nil {
			t.Fatal("close error lost")
		}
	}
}
func TestCleanupFailurePreservesStagingCounter(t *testing.T) {
	calls := []string{}
	ledger := Cleanup{OpenReaders: 1, StagingEntries: 1}
	err := closeCleanup(orderedCloser{&calls, nil}, func() error { calls = append(calls, "cleanup"); return errors.New("cleanup") }, &ledger, nil)
	if err == nil || ledger.OpenReaders != 0 || ledger.StagingEntries != 1 {
		t.Fatalf("err=%v ledger=%+v", err, ledger)
	}
}
