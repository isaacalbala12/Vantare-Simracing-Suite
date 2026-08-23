package coldstart

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/duckdbadapter"
)

const (
	maxInitialCandidates = 1024
	maxInitialFileBytes  = int64(8 << 30)
)

func StandardLMUTelemetryRoot() string {
	programFiles := os.Getenv("ProgramFiles(x86)")
	if programFiles == "" {
		programFiles = `C:\Program Files (x86)`
	}
	return filepath.Join(programFiles, "Steam", "steamapps", "common", "Le Mans Ultimate", "UserData", "Telemetry")
}

func DiscoverStandardLMU(ctx context.Context, root string, stabilityWindow time.Duration) ([]telemetryanalysis.Candidate, error) {
	if _, err := os.Stat(root); errors.Is(err, os.ErrNotExist) {
		return []telemetryanalysis.Candidate{}, nil
	} else if err != nil {
		return nil, fmt.Errorf("inspect standard LMU telemetry root: %w", err)
	}
	first, err := telemetryanalysis.Discover(ctx, telemetryanalysis.OSMetadataSource{}, telemetryanalysis.SourceRoot{Kind: telemetryanalysis.SourceLMU, Root: root, Format: telemetryanalysis.LMUDuckDBParserID, Extensions: []string{".duckdb"}}, maxInitialCandidates)
	if err != nil {
		return nil, err
	}
	trackers := make(map[string]*telemetryanalysis.StabilityTracker, len(first))
	readyCandidates := make(map[string]telemetryanalysis.Candidate, len(first))
	observedAt := time.Now().UTC()
	for _, candidate := range first {
		if candidate.WALPresent {
			continue
		}
		tracker, trackerErr := telemetryanalysis.NewStabilityTracker(stabilityWindow)
		if trackerErr != nil {
			return nil, trackerErr
		}
		trackers[candidate.Locator] = tracker
		readyCandidates[candidate.Locator] = tracker.Assess(candidate, candidateObservation(candidate, observedAt))
	}
	if len(trackers) == 0 {
		return []telemetryanalysis.Candidate{}, nil
	}
	timer := time.NewTimer(stabilityWindow)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-timer.C:
	}
	second, err := telemetryanalysis.Discover(ctx, telemetryanalysis.OSMetadataSource{}, telemetryanalysis.SourceRoot{Kind: telemetryanalysis.SourceLMU, Root: root, Format: telemetryanalysis.LMUDuckDBParserID, Extensions: []string{".duckdb"}}, maxInitialCandidates)
	if err != nil {
		return nil, err
	}
	result := make([]telemetryanalysis.Candidate, 0, len(second))
	observedAt = time.Now().UTC()
	for _, candidate := range second {
		tracker, ok := trackers[candidate.Locator]
		if !ok || candidate.WALPresent {
			continue
		}
		assessed := tracker.Assess(readyCandidates[candidate.Locator], candidateObservation(candidate, observedAt))
		if assessed.State == telemetryanalysis.StateReady {
			result = append(result, assessed)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Locator < result[j].Locator })
	return result, nil
}

func candidateObservation(candidate telemetryanalysis.Candidate, observedAt time.Time) telemetryanalysis.Observation {
	return telemetryanalysis.Observation{ObservedAt: observedAt, Exists: true, Compatible: true, WALPresent: candidate.WALPresent, Size: candidate.Size, ModTime: candidate.ModTime}
}

type LMUImporter struct {
	runtime     duckdbadapter.Runtime
	stagingRoot string
}

func NewLMUImporter(applicationDirectory, stagingRoot string) (*LMUImporter, error) {
	runtimeFiles, err := duckdbadapter.LoadRuntime(duckdbadapter.ProductionTrust(applicationDirectory))
	if err != nil {
		return nil, err
	}
	if !filepath.IsAbs(stagingRoot) {
		return nil, fmt.Errorf("cold start staging root must be absolute")
	}
	return &LMUImporter{runtime: runtimeFiles, stagingRoot: stagingRoot}, nil
}

func (importer *LMUImporter) Import(ctx context.Context, candidate telemetryanalysis.Candidate) (telemetryanalysis.AuthorizedSessionModel, error) {
	if importer == nil {
		return telemetryanalysis.AuthorizedSessionModel{}, fmt.Errorf("LMU importer unavailable")
	}
	artifact, err := telemetryanalysis.BuildAuthorizedHistoricalArtifact(ctx, telemetryanalysis.OSContentSource{}, candidate, telemetryanalysis.ImportOptions{Storage: telemetryanalysis.StorageManagedCopy, Access: telemetryanalysis.AccessUserApproved, MaxBytes: maxInitialFileBytes, ParserID: telemetryanalysis.LMUDuckDBParserID, ParserVersion: telemetryanalysis.LMUDuckDBParserVersion, Provenance: telemetryanalysis.Provenance{Kind: telemetryanalysis.ProvenanceUser, EvidenceID: "strategy-cold-start"}})
	if err != nil {
		return telemetryanalysis.AuthorizedSessionModel{}, fmt.Errorf("authorize LMU historical session: %w", err)
	}
	staged, err := telemetryanalysis.StageAuthorizedHistoricalArtifact(ctx, telemetryanalysis.OSContentSource{}, candidate, artifact, importer.stagingRoot)
	if err != nil {
		return telemetryanalysis.AuthorizedSessionModel{}, fmt.Errorf("stage LMU historical session: %w", err)
	}
	defer staged.Cleanup()
	reader, err := duckdbadapter.NewReader(importer.runtime, artifact, staged)
	if err != nil {
		return telemetryanalysis.AuthorizedSessionModel{}, fmt.Errorf("open LMU DuckDB session: %w", err)
	}
	defer reader.Close()
	parser, err := telemetryanalysis.NewLMUDuckDBParser(artifact, reader, telemetryanalysis.MaxLMUDuckDBPageRows)
	if err != nil {
		return telemetryanalysis.AuthorizedSessionModel{}, fmt.Errorf("create LMU DuckDB parser: %w", err)
	}
	session, err := parser.Inspect(ctx)
	if err != nil {
		return telemetryanalysis.AuthorizedSessionModel{}, fmt.Errorf("inspect LMU DuckDB session: %w", err)
	}
	pages, err := readAllPages(ctx, parser, session)
	if err != nil {
		return telemetryanalysis.AuthorizedSessionModel{}, fmt.Errorf("read LMU DuckDB session pages: %w", err)
	}
	model := telemetryanalysis.AuthorizedSessionModel{Artifact: artifact, Session: session}
	validity, validityErr := telemetryanalysis.AnalyzeLapValidity(session, pages)
	if validityErr != nil {
		return model, nil
	}
	model.Validity = &validity
	model.Session.Laps = historicalLaps(validity)
	classified, err := telemetryanalysis.ClassifyHistoricalSession(model.Session)
	if err != nil {
		return model, nil
	}
	if consumption, deriveErr := telemetryanalysis.DeriveSessionConsumptionPace(model.Session, pages, classified, validity); deriveErr == nil {
		model.Consumption = &consumption
		if curves, curvesErr := telemetryanalysis.DeriveSessionCurves(model.Session, pages, classified, validity, consumption); curvesErr == nil {
			model.Curves = &curves
		}
	}
	if pit, pitErr := telemetryanalysis.DeriveSessionPitObservation(model.Session, pages, classified); pitErr == nil {
		model.Pit = &pit
	}
	return model, nil
}

func readAllPages(ctx context.Context, parser *telemetryanalysis.LMUDuckDBParser, session telemetryanalysis.HistoricalSession) ([]telemetryanalysis.HistoricalPage, error) {
	pages := []telemetryanalysis.HistoricalPage{}
	for _, channel := range requiredChannelsForSession(session) {
		for start := int64(0); ; {
			page, err := parser.ReadPage(ctx, channel.ID, start, telemetryanalysis.MaxLMUDuckDBPageRows)
			if err != nil {
				return nil, err
			}
			if len(page.Samples) == 0 {
				break
			}
			pages = append(pages, page)
			start += int64(len(page.Samples))
			if len(page.Samples) < telemetryanalysis.MaxLMUDuckDBPageRows {
				break
			}
		}
	}
	return pages, nil
}

func requiredChannelsForSession(session telemetryanalysis.HistoricalSession) []telemetryanalysis.HistoricalChannel {
	required := telemetryanalysis.RequiredHistoricalPageChannels()
	wanted := make(map[string]struct{}, len(required))
	for _, sourceName := range required {
		wanted[sourceName] = struct{}{}
	}
	channels := make([]telemetryanalysis.HistoricalChannel, 0, len(required))
	for _, channel := range session.Channels {
		key := strings.ToLower(strings.TrimSpace(channel.SourceName))
		if _, ok := wanted[key]; ok {
			channels = append(channels, channel)
		}
	}
	return channels
}

func historicalLaps(validity telemetryanalysis.LapValidityAnalysis) []telemetryanalysis.HistoricalLap {
	result := make([]telemetryanalysis.HistoricalLap, 0, len(validity.Laps))
	for _, lap := range validity.Laps {
		end := float64(lap.End.UnixNano()) / float64(time.Second)
		entry := telemetryanalysis.HistoricalLap{Number: int64(lap.Number), EndSeconds: &end, Boundary: telemetryanalysis.QualityValid, Validity: telemetryanalysis.QualityValid}
		if lap.Start != nil {
			entry.StartSeconds = float64(lap.Start.UnixNano()) / float64(time.Second)
		}
		if !lap.Complete {
			entry.EndSeconds = nil
			entry.Validity = telemetryanalysis.QualityMissing
		}
		result = append(result, entry)
	}
	return result
}

var _ SessionImporter = (*LMUImporter)(nil)
