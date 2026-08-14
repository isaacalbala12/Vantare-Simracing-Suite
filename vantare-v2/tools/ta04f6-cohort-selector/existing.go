package main

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"sort"
	"strings"
)

const (
	protocolSHA        = "7a8dc1bc97a6005db362916810f8417d527b40f8"
	expectedBranch     = "work/ta04f-repetition-variance"
	maxReadyCandidates = 512
	maxStagedBytes     = int64(32 << 30)
)

type ExistingConfigV1 struct {
	ProtocolSHA string
	RunnerSHA   string
	OutputPath  string
}

type ExistingCandidateV1 struct {
	Token string
	Sort  CandidateV1
}

type ProcessedCandidateV1 struct {
	Algarve   bool
	SessionID string
	Group     GroupKeyV1
	Recording *CanonicalRecordingV1
	Reject    string
}

type CleanupLedgerV1 struct {
	OpenReaders    int `json:"open_readers"`
	StagingEntries int `json:"staging_entries"`
	StagingRoots   int `json:"staging_roots"`
}

type CountHistogramV1 struct {
	Count      int `json:"count"`
	Recordings int `json:"recordings"`
}

type GroupEvidenceV1 struct {
	GroupOrdinal                string             `json:"group_ordinal"`
	Recordings                  int                `json:"recordings"`
	Population                  PopulationCountsV1 `json:"population"`
	GuardRejected               int                `json:"guard_rejected"`
	DataInvalid                 int                `json:"data_invalid"`
	ContributorsPreliminaryGE10 int                `json:"contributors_preliminary_ge10"`
	CenterPresent               bool               `json:"center_present"`
	EligiblePostfilterGE10      int                `json:"eligible_postfilter_ge10"`
	PreliminaryCountHistogram   []CountHistogramV1 `json:"preliminary_count_histogram"`
	PostfilterCountHistogram    []CountHistogramV1 `json:"postfilter_count_histogram"`
}

type FreezeManifestV1 struct {
	Version                  string            `json:"version"`
	ProtocolSHA              string            `json:"protocol_sha"`
	RunnerSHA                string            `json:"runner_sha"`
	Outcome                  string            `json:"outcome"`
	CommitKey                string            `json:"commit_key,omitempty"`
	AlgarveRecordings        int               `json:"algarve_recordings"`
	OracleEvaluable          int               `json:"oracle_evaluable"`
	LowEvent                 int               `json:"low_event"`
	OracleInvalid            int               `json:"oracle_invalid"`
	GuardRejected            int               `json:"guard_rejected"`
	DataInvalid              int               `json:"data_invalid"`
	Resets                   int               `json:"resets"`
	Boundaries               int               `json:"boundaries"`
	Matches                  int               `json:"matches"`
	Mismatches               int               `json:"mismatches"`
	OneSideInvalid           int               `json:"one_side_invalid"`
	Unpaired                 int               `json:"unpaired"`
	PreliminaryWindows       int               `json:"preliminary_windows"`
	ValidLaps                int               `json:"valid_laps"`
	SelectedRecordings       int               `json:"selected_recordings"`
	SelectedLaps             int               `json:"selected_laps"`
	RecordingCommitments     []string          `json:"recording_commitments,omitempty"`
	SerializationCommitments []string          `json:"serialization_commitments,omitempty"`
	LapCommitments           []string          `json:"lap_commitments,omitempty"`
	Cleanup                  CleanupLedgerV1   `json:"cleanup"`
	Groups                   []GroupEvidenceV1 `json:"groups"`
}

type existingBackendV1 interface {
	Preflight(context.Context, ExistingConfigV1) error
	SyntheticControls() error
	Ready(context.Context) ([]ExistingCandidateV1, error)
	Process(context.Context, ExistingCandidateV1, [32]byte) (ProcessedCandidateV1, error)
	CleanupRoot() error
	Ledger() CleanupLedgerV1
}

func normalizePublicV1(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(s)), " "))
}

func normalizeGroupV1(g GroupKeyV1) GroupKeyV1 {
	return GroupKeyV1{normalizePublicV1(g.TrackName), normalizePublicV1(g.TrackLayout), normalizePublicV1(g.CarName), normalizePublicV1(g.CarClass)}
}

func isAlgarveV1(g GroupKeyV1) bool {
	g = normalizeGroupV1(g)
	for _, value := range []string{g.TrackName, g.TrackLayout} {
		for _, alias := range []string{"algarve international circuit", "autodromo internacional do algarve", "autódromo internacional do algarve", "portimao", "portimão"} {
			if strings.Contains(value, alias) {
				return true
			}
		}
	}
	return false
}

func groupDigestV1(g GroupKeyV1) [32]byte {
	g = normalizeGroupV1(g)
	h := sha256.New()
	_, _ = h.Write([]byte("TA-04F6/group/v1\x00"))
	for _, value := range []string{g.TrackName, g.TrackLayout, g.CarName, g.CarClass} {
		var n [8]byte
		binary.LittleEndian.PutUint64(n[:], uint64(len(value)))
		_, _ = h.Write(n[:])
		_, _ = h.Write([]byte(value))
	}
	var out [32]byte
	copy(out[:], h.Sum(nil))
	return out
}

func validAlgarveCompositionV1(counts []int) bool {
	if len(counts) != 5 {
		return false
	}
	counts = append([]int(nil), counts...)
	sort.Sort(sort.Reverse(sort.IntSlice(counts)))
	want := []int{10, 3, 1, 1, 1}
	for i := range want {
		if counts[i] != want[i] {
			return false
		}
	}
	return true
}

func runExistingWithBackend(ctx context.Context, cfg ExistingConfigV1, backend existingBackendV1, random io.Reader) (manifest FreezeManifestV1, returnErr error) {
	if ctx == nil || backend == nil || random == nil {
		return manifest, invalid()
	}
	if err := backend.Preflight(ctx, cfg); err != nil {
		return manifest, &CodedError{Code: CodePipelineFault}
	}
	cleanupNeeded := true
	defer func() {
		if cleanupNeeded {
			if err := backend.CleanupRoot(); err != nil && returnErr == nil {
				manifest = FreezeManifestV1{}
				returnErr = &CodedError{Code: CodePipelineFault}
			}
			if l := backend.Ledger(); l != (CleanupLedgerV1{}) && returnErr == nil {
				manifest = FreezeManifestV1{}
				returnErr = &CodedError{Code: CodePipelineFault}
			}
		}
	}()
	if err := backend.SyntheticControls(); err != nil {
		return manifest, &CodedError{Code: CodePipelineFault}
	}
	candidates, err := backend.Ready(ctx)
	if err != nil {
		return manifest, &CodedError{Code: CodePipelineFault}
	}
	if len(candidates) > maxReadyCandidates {
		return manifest, &CodedError{Code: CodePipelineFault}
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		a, b := candidates[i].Sort, candidates[j].Sort
		an, bn := a.ModifiedAt.UTC().UnixNano(), b.ModifiedAt.UTC().UnixNano()
		if an != bn {
			return an < bn
		}
		if a.Size != b.Size {
			return a.Size < b.Size
		}
		return a.Locator < b.Locator
	})
	var totalBytes int64
	var key [32]byte
	if _, err := io.ReadFull(random, key[:]); err != nil {
		return manifest, &CodedError{Code: CodePipelineFault}
	}
	results := make([]RecordingResultV1, 0)
	pending := make(map[string]pendingCommitmentsV1)
	retention := &serializationRetentionV1{}
	sessions := make(map[string]bool)
	groupCounts := make(map[[32]byte]int)
	groupRejects := make(map[string]int)
	manifest = FreezeManifestV1{Version: "ta04f6/v1", ProtocolSHA: cfg.ProtocolSHA, RunnerSHA: cfg.RunnerSHA}
	groupPopulations := map[string]PopulationCountsV1{}
	for _, candidate := range candidates {
		if err := ctx.Err(); err != nil {
			return FreezeManifestV1{}, err
		}
		if candidate.Sort.Size < 0 || candidate.Sort.Size > maxStagedBytes-totalBytes {
			return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
		}
		totalBytes += candidate.Sort.Size
		processed, err := backend.Process(ctx, candidate, key)
		if err != nil {
			return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
		}
		if !processed.Algarve {
			continue
		}
		g := normalizeGroupV1(processed.Group)
		if processed.Recording != nil {
			g = normalizeGroupV1(processed.Recording.Group)
		}
		if processed.SessionID == "" {
			return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
		}
		if sessions[processed.SessionID] {
			continue
		}
		sessions[processed.SessionID] = true
		manifest.AlgarveRecordings++
		digest := groupDigestV1(g)
		digestText := hex.EncodeToString(digest[:])
		groupCounts[digest]++
		if processed.Recording == nil {
			return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
		}
		recording := *processed.Recording
		recording.Group = g
		r, err := ClassifyV1(recording)
		r.Order = len(results)
		r.RecordingToken = processed.SessionID
		r.GroupDigest = digest
		if err != nil {
			if r.Population == "" {
				return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
			}
			incrementManifestPopulationV1(&manifest, groupPopulations, digestText, r.Population)
			manifest.GuardRejected++
			manifest.DataInvalid++
			groupRejects[digestText]++
			results = append(results, r)
			continue
		}
		if processed.Reject != "" {
			incrementManifestPopulationV1(&manifest, groupPopulations, digestText, r.Population)
			manifest.GuardRejected++
			manifest.DataInvalid++
			groupRejects[digestText]++
			r.PreliminaryLaps = nil
			r.RecordingMedian = 0
			results = append(results, r)
			continue
		}
		incrementManifestPopulationV1(&manifest, groupPopulations, digestText, r.Population)
		results = append(results, r)
		manifest.Resets += r.Resets
		manifest.Boundaries += r.Boundaries
		manifest.Matches += r.Matches
		manifest.Mismatches += r.Mismatches
		manifest.OneSideInvalid += r.OneSideInvalid
		manifest.Unpaired += r.Unpaired
		manifest.PreliminaryWindows += len(r.PreliminaryLaps)
		if r.Population == PopulationEvaluable {
			commitments, commitErr := commitRecordingV1(key, processed.SessionID, recording, retention)
			if commitErr != nil {
				return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
			}
			pending[processed.SessionID] = commitments
		}
		processed.Recording = nil
		recording = CanonicalRecordingV1{}
	}
	if retention.CurrentBytes != 0 || retention.CurrentBuffers != 0 || retention.MaxBuffers > 1 {
		return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
	}
	counts := make([]int, 0, len(groupCounts))
	for digest, count := range groupCounts {
		counts = append(counts, count)
		digestText := hex.EncodeToString(digest[:])
		if groupPopulations[digestText].Recordings != count {
			return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
		}
	}
	if !validAlgarveCompositionV1(counts) || manifest.AlgarveRecordings != 16 || manifest.LowEvent+manifest.OracleInvalid+manifest.OracleEvaluable != manifest.AlgarveRecordings {
		return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
	}
	cohort, validLaps, evaluations, err := evaluateGroupsV1(results)
	if err != nil {
		return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
	}
	if len(cohort.Recordings) == 0 {
		manifest.Outcome = "stop_insufficient"
	} else {
		manifest.Outcome = "cohort_frozen"
		manifest.CommitKey = hex.EncodeToString(key[:])
	}
	manifest.SelectedRecordings = len(cohort.Recordings)
	manifest.SelectedLaps = len(cohort.Laps)
	manifest.ValidLaps = validLaps
	manifest.Groups = buildGroupEvidenceV1(evaluations, groupPopulations, groupRejects)
	for _, r := range cohort.Recordings {
		base, ok := pending[r.RecordingToken]
		if !ok {
			return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
		}
		manifest.RecordingCommitments = append(manifest.RecordingCommitments, hex.EncodeToString(base.Recording[:]))
		manifest.SerializationCommitments = append(manifest.SerializationCommitments, hex.EncodeToString(base.Serialization[:]))
		for _, lap := range r.ValidLaps {
			lapCommitment := BuildLapCommitmentV1(key, base.Recording, lap.StartOrdinal, lap.EndOrdinal)
			manifest.LapCommitments = append(manifest.LapCommitments, hex.EncodeToString(lapCommitment[:]))
		}
	}
	if err := backend.CleanupRoot(); err != nil {
		return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
	}
	cleanupNeeded = false
	manifest.Cleanup = backend.Ledger()
	if manifest.Cleanup != (CleanupLedgerV1{}) {
		return FreezeManifestV1{}, &CodedError{Code: CodePipelineFault}
	}
	return manifest, nil
}

func buildGroupEvidenceV1(evaluations []GroupEvaluationV1, populations map[string]PopulationCountsV1, rejects map[string]int) []GroupEvidenceV1 {
	evidence := make([]GroupEvidenceV1, 0, len(evaluations))
	for i, evaluation := range evaluations {
		digestText := hex.EncodeToString(evaluation.Digest[:])
		e := GroupEvidenceV1{GroupOrdinal: fmt.Sprintf("group_%d", i+1), Recordings: evaluation.Recordings, Population: populations[digestText], GuardRejected: rejects[digestText], DataInvalid: rejects[digestText], ContributorsPreliminaryGE10: evaluation.Contributors, CenterPresent: evaluation.CenterPresent, EligiblePostfilterGE10: evaluation.EligiblePostfilter, PreliminaryCountHistogram: histogramV1(evaluation.PreliminaryCounts), PostfilterCountHistogram: histogramV1(evaluation.PostfilterCounts)}
		if e.PostfilterCountHistogram == nil {
			e.PostfilterCountHistogram = []CountHistogramV1{}
		}
		evidence = append(evidence, e)
	}
	return evidence
}

func histogramV1(counts []int) []CountHistogramV1 {
	sort.Ints(counts)
	out := make([]CountHistogramV1, 0)
	for _, count := range counts {
		if len(out) > 0 && out[len(out)-1].Count == count {
			out[len(out)-1].Recordings++
			continue
		}
		out = append(out, CountHistogramV1{Count: count, Recordings: 1})
	}
	return out
}

func incrementPopulationV1(counts map[string]PopulationCountsV1, digest string, population PopulationV1) {
	value := counts[digest]
	value.Recordings++
	switch population {
	case PopulationLowEvent:
		value.LowEvent++
	case PopulationInvalid:
		value.OracleInvalid++
	case PopulationEvaluable:
		value.OracleEvaluable++
	}
	counts[digest] = value
}

func incrementManifestPopulationV1(manifest *FreezeManifestV1, groups map[string]PopulationCountsV1, digest string, population PopulationV1) {
	switch population {
	case PopulationEvaluable:
		manifest.OracleEvaluable++
	case PopulationLowEvent:
		manifest.LowEvent++
	case PopulationInvalid:
		manifest.OracleInvalid++
	}
	incrementPopulationV1(groups, digest, population)
}
