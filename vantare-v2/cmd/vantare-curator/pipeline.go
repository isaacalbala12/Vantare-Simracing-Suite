package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/strategy/backtest"
	"github.com/vantare/overlays/v2/internal/strategy/curation"
	"github.com/vantare/overlays/v2/internal/strategy/manual"
	"github.com/vantare/overlays/v2/internal/strategy/pilotprofile"
	"github.com/vantare/overlays/v2/internal/strategy/solver"
	sp "github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

const scoreBasis = "backtest_f4_9_normalized_lap_1s_observed_pit_duration"

var allowedEnvironments = map[string]bool{
	"test":                 true,
	"controlled-capture":   true,
	"production-community": true,
}

type inputFile struct {
	path        string
	relative    string
	environment string
	mode        fs.FileMode
}

type semanticRecord struct {
	digest       string
	payload      curation.BundlePayload
	contributors map[string]bool
}

type environmentState struct {
	accepted   int
	duplicates int
	records    map[string]*semanticRecord
}

type combinationState struct {
	records      []*semanticRecord
	contributors map[string]bool
}

func buildSummary(inputDirectory string) ([]byte, error) {
	files, err := discoverInputFiles(inputDirectory)
	if err != nil {
		return nil, err
	}

	result := summary{
		ContractVersion: summaryContractVersion,
		MinimumCohort:   minimumCohort,
		Engine: engineSummary{
			Version:    backtest.ContractVersionV1,
			SourceHash: backtest.EngineSourceHash,
		},
		Input:        inputSummary{Files: len(files)},
		Environments: []environmentSummary{},
		Rejections:   []rejectionSummary{},
	}
	states := make(map[string]*environmentState, len(allowedEnvironments))
	for _, environment := range sortedEnvironmentNames() {
		states[environment] = &environmentState{records: make(map[string]*semanticRecord)}
	}

	for _, file := range files {
		rejection := rejectionForInput(file)
		if rejection != nil {
			result.Rejections = append(result.Rejections, *rejection)
			continue
		}
		data, err := os.ReadFile(file.path)
		if err != nil {
			result.Rejections = append(result.Rejections, newRejection(file, "read_failed", "the bundle could not be read"))
			continue
		}
		bundle, err := curation.StrictDecode(data)
		if err != nil {
			code, reason := classifyBundleError(err)
			result.Rejections = append(result.Rejections, newRejection(file, code, reason))
			continue
		}
		digest, normalized, err := semanticDigest(bundle.Payload)
		if err != nil {
			result.Rejections = append(result.Rejections, newRejection(file, "normalization_failed", "the validated payload could not be normalized"))
			continue
		}

		state := states[file.environment]
		state.accepted++
		result.Input.Accepted++
		if existing, ok := state.records[digest]; ok {
			existing.contributors[bundle.Admin.DeleteHash] = true
			state.duplicates++
			result.Input.Duplicates++
			continue
		}
		state.records[digest] = &semanticRecord{
			digest:       digest,
			payload:      normalized,
			contributors: map[string]bool{bundle.Admin.DeleteHash: true},
		}
	}

	result.Input.Rejected = len(result.Rejections)
	for _, environment := range sortedEnvironmentNames() {
		state := states[environment]
		environmentResult := environmentSummary{
			Environment:  environment,
			Accepted:     state.accepted,
			Duplicates:   state.duplicates,
			Combinations: []combinationSummary{},
		}
		combinations := groupCombinations(state.records)
		for _, combinationID := range sortedCombinationNames(combinations) {
			environmentResult.Combinations = append(environmentResult.Combinations, summarizeCombination(combinationID, combinations[combinationID]))
		}
		result.Environments = append(result.Environments, environmentResult)
	}

	encoded, err := json.Marshal(result)
	if err != nil {
		return nil, fmt.Errorf("encode deterministic curator summary: %w", err)
	}
	return encoded, nil
}

func discoverInputFiles(root string) ([]inputFile, error) {
	info, err := os.Stat(root)
	if err != nil {
		return nil, fmt.Errorf("inspect input directory: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("input path is not a directory")
	}
	var files []inputFile
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("walk input %q: %w", filepath.Base(path), walkErr)
		}
		if path == root || entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return fmt.Errorf("resolve input entry: %w", err)
		}
		parts := strings.Split(filepath.ToSlash(relative), "/")
		environment := "unknown"
		if len(parts) > 1 && allowedEnvironments[parts[0]] {
			environment = parts[0]
		}
		files = append(files, inputFile{path: path, relative: filepath.ToSlash(relative), environment: environment, mode: entry.Type()})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(files, func(i, j int) bool { return files[i].relative < files[j].relative })
	return files, nil
}

func rejectionForInput(file inputFile) *rejectionSummary {
	if file.environment == "unknown" {
		rejection := newRejection(file, "invalid_environment", "the bundle is not inside an allowed environment directory")
		return &rejection
	}
	if file.mode&os.ModeSymlink != 0 || !file.mode.IsRegular() {
		rejection := newRejection(file, "invalid_entry_type", "only regular bundle files are accepted")
		return &rejection
	}
	if filepath.Ext(file.relative) != ".json" {
		rejection := newRejection(file, "invalid_extension", "bundle files must use the .json extension")
		return &rejection
	}
	return nil
}

func newRejection(file inputFile, code, reason string) rejectionSummary {
	environment := file.environment
	if environment == "" {
		environment = "unknown"
	}
	return rejectionSummary{SourceRef: sourceReference(file.relative), Environment: environment, Code: code, Reason: reason}
}

func classifyBundleError(err error) (string, string) {
	message := err.Error()
	switch {
	case strings.Contains(message, "denylist"):
		return "privacy_denylist", "the bundle matched a forbidden privacy pattern"
	case strings.Contains(message, "duplicate JSON field"):
		return "duplicate_field", "the bundle contains a duplicate JSON field"
	case strings.Contains(message, "unknown field"):
		return "unknown_field", "the bundle contains a field outside CurationBundle v1"
	case strings.Contains(message, "trailing"):
		return "trailing_data", "the bundle contains data after the single JSON value"
	case strings.Contains(message, "strict decode"):
		return "invalid_json", "the bundle is not valid strict CurationBundle v1 JSON"
	default:
		return "invalid_contract", "the bundle violates CurationBundle v1 validation"
	}
}

func sourceReference(relative string) string {
	digest := sha256.Sum256([]byte(relative))
	return "source-" + hex.EncodeToString(digest[:6])
}

func semanticDigest(payload curation.BundlePayload) (string, curation.BundlePayload, error) {
	normalized := payload
	normalized.BundleID = ""
	normalized.StintAggregates = append([]curation.StintAggregate(nil), payload.StintAggregates...)
	sort.Slice(normalized.StintAggregates, func(i, j int) bool {
		return normalized.StintAggregates[i].StintNumber < normalized.StintAggregates[j].StintNumber
	})
	normalized.ObservedStrategies = append([]curation.ObservedStrategyRef(nil), payload.ObservedStrategies...)
	for index := range normalized.ObservedStrategies {
		normalized.ObservedStrategies[index].PitLaps = append([]int(nil), normalized.ObservedStrategies[index].PitLaps...)
		normalized.ObservedStrategies[index].Compounds = append([]string(nil), normalized.ObservedStrategies[index].Compounds...)
	}
	sort.Slice(normalized.ObservedStrategies, func(i, j int) bool {
		return strategyKey(normalized.ObservedStrategies[i]) < strategyKey(normalized.ObservedStrategies[j])
	})
	encoded, err := json.Marshal(normalized)
	if err != nil {
		return "", curation.BundlePayload{}, fmt.Errorf("marshal normalized payload: %w", err)
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:]), normalized, nil
}

func groupCombinations(records map[string]*semanticRecord) map[string]*combinationState {
	result := make(map[string]*combinationState)
	for _, record := range records {
		combinationID := record.payload.CombinationID
		state := result[combinationID]
		if state == nil {
			state = &combinationState{contributors: make(map[string]bool)}
			result[combinationID] = state
		}
		state.records = append(state.records, record)
		mergeSet(state.contributors, record.contributors)
	}
	for _, state := range result {
		sort.Slice(state.records, func(i, j int) bool { return state.records[i].digest < state.records[j].digest })
	}
	return result
}

func summarizeCombination(combinationID string, state *combinationState) combinationSummary {
	publishable := len(state.contributors) >= minimumCohort
	result := combinationSummary{
		CombinationID:   combinationID,
		SemanticBundles: len(state.records),
		Contributors:    len(state.contributors),
		Publishable:     publishable,
		Reference:       summarizeReference(state, publishable),
		Strategies:      []strategyClusterSummary{},
	}
	if !publishable {
		result.Reason = "minimum_cohort_not_met"
		return result
	}
	result.Strategies = summarizeStrategies(combinationID, state)
	return result
}

func summarizeReference(state *combinationState, publishable bool) referenceProfileSummary {
	result := referenceProfileSummary{
		TargetContractVersion: string(pilotprofile.ContractVersionV1),
		Publishable:           publishable,
	}
	if !publishable {
		result.Reason = "minimum_cohort_not_met"
		return result
	}
	result.Pace = &presenceReason{Available: false, Reason: "pace_not_present_in_curationbundle_v1"}
	result.StintPaceCurve = &presenceReason{Available: false, Reason: "stint_pace_curve_not_present_in_curationbundle_v1"}
	var fuel, ve, pitDuration metricAccumulator
	quality := qualitySummary{}
	pitCount := 0
	for _, record := range state.records {
		for _, stint := range record.payload.StintAggregates {
			fuel.add(stint.AvgFuelPerLap, stint.Laps)
			ve.add(stint.AvgVEPerLap, stint.Laps)
		}
		recordQuality := record.payload.ChannelQuality
		quality.ValidSessions += recordQuality.ValidSessions
		quality.InvalidSessions += recordQuality.InvalidSessions
		if pit := record.payload.PitAggregates; pit != nil && pit.Count > 0 {
			pitDuration.add(pit.AvgDurationSeconds, pit.Count)
			pitCount += pit.Count
		}
	}
	fuelSummary := fuel.summary()
	veSummary := ve.summary()
	result.Fuel = &fuelSummary
	result.VirtualEnergy = &veSummary
	if pitCount > 0 {
		result.Pit = &pitSummary{Count: pitCount, TypicalDurationSeconds: pitDuration.median()}
	}
	qualityTotal := quality.ValidSessions + quality.InvalidSessions
	quality.SampleSessions = qualityTotal
	if qualityTotal > 0 {
		quality.ValidRatio = float64(quality.ValidSessions) / float64(qualityTotal)
	}
	result.Quality = &quality
	return result
}

type metricAccumulator struct {
	values []weightedMetric
	sample int
}

type weightedMetric struct {
	value  float64
	weight int
}

func (a *metricAccumulator) add(value float64, weight int) {
	if weight <= 0 {
		return
	}
	a.values = append(a.values, weightedMetric{value: value, weight: weight})
	a.sample += weight
}

func (a metricAccumulator) summary() metricSummary {
	result := metricSummary{SampleLaps: a.sample}
	if len(a.values) == 0 {
		return result
	}
	values := a.sortedValues()
	result.MedianPerLap = weightedMedian(values, a.sample)
	result.RangeLower = values[0].value
	result.RangeUpper = values[len(values)-1].value
	return result
}

func (a metricAccumulator) median() float64 {
	if len(a.values) == 0 {
		return 0
	}
	return weightedMedian(a.sortedValues(), a.sample)
}

func (a metricAccumulator) sortedValues() []weightedMetric {
	values := append([]weightedMetric(nil), a.values...)
	sort.Slice(values, func(i, j int) bool { return values[i].value < values[j].value })
	return values
}

func weightedMedian(values []weightedMetric, sample int) float64 {
	left := valueAtWeight(values, (sample-1)/2)
	right := valueAtWeight(values, sample/2)
	return left + (right-left)/2
}

func valueAtWeight(values []weightedMetric, target int) float64 {
	seen := 0
	for _, value := range values {
		seen += value.weight
		if target < seen {
			return value.value
		}
	}
	return values[len(values)-1].value
}

type strategyOccurrence struct {
	strategy     curation.ObservedStrategyRef
	recordDigest string
	contributors map[string]bool
}

type strategyCluster struct {
	representative curation.ObservedStrategyRef
	members        map[string]bool
	records        map[string]bool
	contributors   map[string]bool
}

func summarizeStrategies(combinationID string, state *combinationState) []strategyClusterSummary {
	occurrences := make([]strategyOccurrence, 0)
	for _, record := range state.records {
		seen := make(map[string]bool)
		for _, strategy := range record.payload.ObservedStrategies {
			key := strategyKey(strategy)
			if seen[key] {
				continue
			}
			seen[key] = true
			occurrences = append(occurrences, strategyOccurrence{strategy: strategy, recordDigest: record.digest, contributors: record.contributors})
		}
	}
	sort.Slice(occurrences, func(i, j int) bool {
		return strategyKey(occurrences[i].strategy) < strategyKey(occurrences[j].strategy)
	})
	clusters := make([]*strategyCluster, 0)
	for _, occurrence := range occurrences {
		var selected *strategyCluster
		for _, cluster := range clusters {
			if similarStrategies(cluster.representative, occurrence.strategy) {
				selected = cluster
				break
			}
		}
		if selected == nil {
			selected = &strategyCluster{
				representative: occurrence.strategy,
				members:        make(map[string]bool),
				records:        make(map[string]bool),
				contributors:   make(map[string]bool),
			}
			clusters = append(clusters, selected)
		}
		selected.members[strategyKey(occurrence.strategy)] = true
		selected.records[occurrence.recordDigest] = true
		mergeSet(selected.contributors, occurrence.contributors)
	}

	raceLaps := medianRaceLaps(state.records)
	pitDuration := meanPitDuration(state.records)
	result := make([]strategyClusterSummary, 0, len(clusters))
	for _, cluster := range clusters {
		publishable := len(cluster.contributors) >= minimumCohort
		item := strategyClusterSummary{
			ClusterDigest:   clusterDigest(cluster.members),
			Representative:  cluster.representative,
			SemanticBundles: len(cluster.records),
			Contributors:    len(cluster.contributors),
			Publishable:     publishable,
			Score:           scoreStrategy(combinationID, cluster.representative, raceLaps, pitDuration),
		}
		if !publishable {
			item.Reason = "minimum_cohort_not_met"
		}
		result = append(result, item)
	}
	sort.Slice(result, func(i, j int) bool {
		left, right := result[i], result[j]
		if left.Score.Available != right.Score.Available {
			return left.Score.Available
		}
		if left.Score.Available && left.Score.NormalizedTotalSeconds != right.Score.NormalizedTotalSeconds {
			return left.Score.NormalizedTotalSeconds < right.Score.NormalizedTotalSeconds
		}
		return left.ClusterDigest < right.ClusterDigest
	})
	for index := range result {
		result[index].Rank = index + 1
	}
	return result
}

func strategyKey(strategy curation.ObservedStrategyRef) string {
	var value strings.Builder
	value.WriteString(strconv.Itoa(strategy.StintCount))
	value.WriteByte('|')
	for _, lap := range strategy.PitLaps {
		value.WriteString(strconv.Itoa(lap))
		value.WriteByte(',')
	}
	value.WriteByte('|')
	for _, compound := range strategy.Compounds {
		value.WriteString(strconv.Itoa(len(compound)))
		value.WriteByte(':')
		value.WriteString(compound)
		value.WriteByte(',')
	}
	return value.String()
}

func similarStrategies(left, right curation.ObservedStrategyRef) bool {
	if left.StintCount != right.StintCount || len(left.PitLaps) != len(right.PitLaps) || len(left.Compounds) != len(right.Compounds) {
		return false
	}
	for index := range left.PitLaps {
		if absInt(left.PitLaps[index]-right.PitLaps[index]) > 1 {
			return false
		}
	}
	for index := range left.Compounds {
		if left.Compounds[index] != right.Compounds[index] {
			return false
		}
	}
	return true
}

func clusterDigest(members map[string]bool) string {
	keys := sortedSet(members)
	digest := sha256.Sum256([]byte(strings.Join(keys, "\n")))
	return hex.EncodeToString(digest[:])
}

func medianRaceLaps(records []*semanticRecord) int {
	values := make([]int, 0, len(records))
	for _, record := range records {
		total := 0
		for _, stint := range record.payload.StintAggregates {
			total += stint.Laps
		}
		values = append(values, total)
	}
	sort.Ints(values)
	if len(values) == 0 {
		return 0
	}
	return values[(len(values)-1)/2]
}

func meanPitDuration(records []*semanticRecord) float64 {
	weighted, count := 0.0, 0
	for _, record := range records {
		if pit := record.payload.PitAggregates; pit != nil && pit.Count > 0 {
			weighted += pit.AvgDurationSeconds * float64(pit.Count)
			count += pit.Count
		}
	}
	if count == 0 {
		return 0
	}
	return weighted / float64(count)
}

func scoreStrategy(combinationID string, strategy curation.ObservedStrategyRef, raceLaps int, pitDuration float64) scoreSummary {
	result := scoreSummary{Basis: scoreBasis}
	if raceLaps <= 0 {
		result.Reason = "race_laps_unavailable"
		return result
	}
	if len(strategy.PitLaps) > 0 && pitDuration <= 0 {
		result.Reason = "pit_duration_unavailable"
		return result
	}
	if len(strategy.PitLaps) > 0 && strategy.PitLaps[len(strategy.PitLaps)-1] >= raceLaps {
		result.Reason = "pit_lap_outside_aggregated_race"
		return result
	}

	race, err := normalizedRaceCase(combinationID, strategy, raceLaps, pitDuration)
	if err != nil {
		result.Reason = "backtest_input_unavailable"
		return result
	}
	backtestResult, err := backtest.RunRace(race, backtest.ProvisionalThresholds(0))
	if err != nil {
		result.Reason = "backtest_rejected_candidate"
		return result
	}
	result.Available = true
	result.NormalizedTotalSeconds = backtestResult.Calibration.PredictedTotalSeconds
	result.Feasible = backtestResult.Feasibility.Passed
	result.RankingPassed = backtestResult.Ranking.Passed
	return result
}

func normalizedRaceCase(combinationID string, strategy curation.ObservedStrategyRef, raceLaps int, pitDuration float64) (backtest.RaceCase, error) {
	const baseLapSeconds = 1.0
	occurredAt := time.Date(2000, 1, 3, 0, 0, 0, 0, time.UTC)
	provenance := sp.Provenance{Kind: sp.ProvenanceDerived, SourceID: "vantare-curator-normalized-input"}
	observed := sp.ObservedStrategyV1{
		ContractVersion: sp.ContractVersionObservedStrategyV1,
		SessionID:       "curator-normalized-race",
		GeneratedAt:     occurredAt.Add(time.Hour),
		Presence:        sp.PresenceValid,
		Provenance:      provenance,
		Confidence:      sp.Confidence{SampleSize: raceLaps, ComputationVersion: summaryContractVersion},
		Stints:          []sp.ObservedStint{},
		PitStops:        []sp.ObservedPitStop{},
		Changes:         []sp.ObservedChange{},
	}
	startLap := 1
	totalSeconds := 0.0
	boundaries := append(append([]int(nil), strategy.PitLaps...), raceLaps)
	for index, endLap := range boundaries {
		if endLap < startLap {
			return backtest.RaceCase{}, fmt.Errorf("invalid normalized stint boundary")
		}
		stintSeconds := float64(endLap-startLap+1) * baseLapSeconds
		if index < len(strategy.PitLaps) {
			stintSeconds += pitDuration
		}
		stintSecondsCopy := stintSeconds
		observed.Stints = append(observed.Stints, sp.ObservedStint{
			StintNumber: index + 1, StartLap: startLap, EndLap: endLap, TotalTimeSeconds: &stintSecondsCopy,
			Presence: sp.PresenceValid, Provenance: provenance,
		})
		if index < len(strategy.PitLaps) {
			observed.PitStops = append(observed.PitStops, sp.ObservedPitStop{
				LapNumber: endLap, PitLaneSeconds: pitDuration, Presence: sp.PresenceValid, Provenance: provenance,
			})
		}
		totalSeconds += stintSeconds
		startLap = endLap + 1
	}
	observed.Result = &sp.ObservedResult{CompletedLaps: raceLaps, TotalTimeSeconds: totalSeconds, Completed: true}

	input := solver.SolverInputV2{
		ContractVersion: solver.SolverContractVersionV2,
		RaceLaps:        int64(raceLaps),
		BaseLapSeconds:  baseLapSeconds,
		PitCost: solver.PitCostModel{
			TransitSeconds:  pitDuration,
			RefuelRateLPerS: 1,
			VERatePPerS:     1,
			ServiceMode:     manual.PitServiceSequential,
		},
		Budget: solver.ComputeBudget{P95Millis: 10_000},
	}
	return backtest.RaceCase{
		RaceID:              observed.SessionID,
		CombinationID:       combinationID,
		OccurredAt:          occurredAt,
		TrainingDataThrough: occurredAt.Add(-24 * time.Hour),
		PredictionInput:     input,
		RealizedInput:       input,
		Observed:            observed,
	}, nil
}

func sortedEnvironmentNames() []string {
	return []string{"test", "controlled-capture", "production-community"}
}

func sortedCombinationNames(values map[string]*combinationState) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func sortedSet(values map[string]bool) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func mergeSet(destination, source map[string]bool) {
	for value := range source {
		destination[value] = true
	}
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
