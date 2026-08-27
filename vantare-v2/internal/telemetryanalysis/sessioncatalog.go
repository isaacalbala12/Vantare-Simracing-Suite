package telemetryanalysis

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis/strategyprojection"
)

var ErrInvalidAuthorizedSession = errors.New("invalid authorized historical session")

// AuthorizedSessionModel binds an inspected historical model and its pure
// derivations to the exact artifact that passed the Analysis authorization
// gate. Consumers never receive a filesystem path or a DuckDB reader.
type AuthorizedSessionModel struct {
	Artifact    AuthorizedHistoricalArtifact
	Session     HistoricalSession
	Validity    *LapValidityAnalysis
	Consumption *SessionConsumptionPace
	Curves      *SessionDerivedCurves
	Pit         *SessionPitObservation
}

type ClimateBucketCount struct {
	Bucket strategyprojection.ClimateBucket `json:"bucket"`
	Laps   int                              `json:"laps"`
}

type SessionCatalogEntry struct {
	SessionID       string                      `json:"sessionId"`
	Type            SessionType                 `json:"type"`
	Status          SessionIdentificationStatus `json:"status"`
	DefaultIncluded bool                        `json:"defaultIncluded"`
	ExclusionReason UnusableReason              `json:"exclusionReason,omitempty"`
	LastActivity    time.Time                   `json:"lastActivity"`
	ClimateBuckets  []ClimateBucketCount        `json:"climateBuckets"`
}

type CombinationCatalogEntry struct {
	Combination    CombinationIdentity   `json:"combination"`
	SessionCount   int                   `json:"sessionCount"`
	RaceCount      int                   `json:"raceCount"`
	LastActivity   time.Time             `json:"lastActivity"`
	ClimateBuckets []ClimateBucketCount  `json:"climateBuckets"`
	Sessions       []SessionCatalogEntry `json:"sessions"`
}

type SessionCatalogExclusion struct {
	SessionID string `json:"sessionId"`
	Reason    string `json:"reason"`
}

type SessionCatalogListing struct {
	Combinations []CombinationCatalogEntry `json:"combinations"`
	Exclusions   []SessionCatalogExclusion `json:"exclusions"`
}

type AuthorizedSessionSource interface {
	ListAuthorizedSessions(context.Context) ([]AuthorizedSessionModel, error)
}

// SessionCatalog is the Analysis-owned query facade. A nil source means the
// user has not authorized any historical telemetry yet; it is an honest empty
// state, not a synthetic catalog.
type SessionCatalog struct {
	source AuthorizedSessionSource
}

func NewSessionCatalog(source AuthorizedSessionSource) *SessionCatalog {
	return &SessionCatalog{source: source}
}

func (catalog *SessionCatalog) ListSessionCombinations(ctx context.Context) (SessionCatalogListing, error) {
	if catalog == nil || catalog.source == nil {
		return SessionCatalogListing{Combinations: []CombinationCatalogEntry{}, Exclusions: []SessionCatalogExclusion{}}, nil
	}
	models, err := catalog.source.ListAuthorizedSessions(ctx)
	if err != nil {
		return SessionCatalogListing{}, err
	}
	return ListAuthorizedSessionCombinations(ctx, models)
}

// ProjectStrategyInputs composes the public Analysis projection for exactly
// the sessions selected by Strategy. Selection is non-destructive: excluded
// sessions remain in the authorized source and are simply not passed to the
// producer.
func (catalog *SessionCatalog) ProjectStrategyInputs(
	ctx context.Context,
	combinationID string,
	sessionIDs []string,
	generatedAt time.Time,
) (strategyprojection.StrategyInputProjectionV2, error) {
	if catalog == nil || catalog.source == nil || strings.TrimSpace(combinationID) == "" || len(sessionIDs) == 0 {
		return strategyprojection.StrategyInputProjectionV2{}, ErrInvalidProjectionProductionInput
	}
	models, err := catalog.source.ListAuthorizedSessions(ctx)
	if err != nil {
		return strategyprojection.StrategyInputProjectionV2{}, err
	}
	requested := make(map[string]struct{}, len(sessionIDs))
	for _, sessionID := range sessionIDs {
		if strings.TrimSpace(sessionID) == "" {
			return strategyprojection.StrategyInputProjectionV2{}, ErrInvalidProjectionProductionInput
		}
		if _, duplicate := requested[sessionID]; duplicate {
			return strategyprojection.StrategyInputProjectionV2{}, ErrInvalidProjectionProductionInput
		}
		requested[sessionID] = struct{}{}
	}
	selected := make([]ProjectionSessionDerivations, 0, len(requested))
	var combination CombinationIdentity
	for _, model := range models {
		if err := ctx.Err(); err != nil {
			return strategyprojection.StrategyInputProjectionV2{}, err
		}
		if _, ok := requested[model.Session.ID]; !ok {
			continue
		}
		manifest := model.Artifact.Manifest()
		if !validAuthorizedHistoricalArtifact(model.Artifact) ||
			model.Session.Provenance.Source != manifest.Source ||
			model.Session.Provenance.Parser != manifest.Parser {
			return strategyprojection.StrategyInputProjectionV2{}, ErrInvalidAuthorizedSession
		}
		classified, classifyErr := ClassifyHistoricalSession(model.Session)
		if classifyErr != nil {
			return strategyprojection.StrategyInputProjectionV2{}, classifyErr
		}
		if classified.Combination.ID != combinationID {
			return strategyprojection.StrategyInputProjectionV2{}, ErrInvalidProjectionProductionInput
		}
		if len(selected) == 0 {
			combination = classified.Combination
		}
		selected = append(selected, ProjectionSessionDerivations{
			Classified:  classified,
			Validity:    model.Validity,
			Consumption: model.Consumption,
			Curves:      model.Curves,
			Pit:         model.Pit,
		})
		delete(requested, model.Session.ID)
	}
	if len(requested) != 0 || len(selected) == 0 {
		return strategyprojection.StrategyInputProjectionV2{}, ErrInvalidProjectionProductionInput
	}
	return ProduceStrategyInputProjectionV2(ProjectionProductionRequest{
		GeneratedAt: generatedAt,
		Combination: combination,
		Sessions:    selected,
	})
}

// ListAuthorizedSessionCombinations is the Analysis-owned application query.
// It classifies and groups only models carrying an unforgeable authorization
// token issued by BuildAuthorizedHistoricalArtifact.
func ListAuthorizedSessionCombinations(ctx context.Context, models []AuthorizedSessionModel) (SessionCatalogListing, error) {
	classified := make([]ClassifiedSession, 0, len(models))
	byID := make(map[string]AuthorizedSessionModel, len(models))
	exclusions := make([]SessionCatalogExclusion, 0)
	for _, model := range models {
		if err := ctx.Err(); err != nil {
			return SessionCatalogListing{}, err
		}
		manifest := model.Artifact.Manifest()
		if !validAuthorizedHistoricalArtifact(model.Artifact) ||
			model.Session.Provenance.Source != manifest.Source ||
			model.Session.Provenance.Parser != manifest.Parser ||
			strings.TrimSpace(model.Session.ID) == "" {
			exclusions = append(exclusions, SessionCatalogExclusion{SessionID: model.Session.ID, Reason: ErrInvalidAuthorizedSession.Error()})
			continue
		}
		item, err := ClassifyHistoricalSession(model.Session)
		if err != nil {
			exclusions = append(exclusions, SessionCatalogExclusion{SessionID: model.Session.ID, Reason: err.Error()})
			continue
		}
		if _, duplicate := byID[item.SessionID]; duplicate {
			exclusions = append(exclusions, SessionCatalogExclusion{SessionID: item.SessionID, Reason: ErrInvalidAuthorizedSession.Error() + ": duplicate session id"})
			continue
		}
		classified = append(classified, item)
		byID[item.SessionID] = model
	}

	groups := GroupClassifiedSessions(classified)
	result := make([]CombinationCatalogEntry, 0, len(groups))
	for _, group := range groups {
		entry := CombinationCatalogEntry{
			Combination:    group.Combination,
			SessionCount:   len(group.Sessions),
			RaceCount:      len(group.Races),
			ClimateBuckets: []ClimateBucketCount{},
			Sessions:       make([]SessionCatalogEntry, 0, len(group.Sessions)),
		}
		bucketTotals := map[strategyprojection.ClimateBucket]int{}
		for _, classifiedSession := range group.Sessions {
			model := byID[classifiedSession.SessionID]
			session := SessionCatalogEntry{
				SessionID:       classifiedSession.SessionID,
				Type:            classifiedSession.Type,
				Status:          classifiedSession.Status,
				DefaultIncluded: classifiedSession.Status == SessionStatusIdentifiedUsable,
				LastActivity:    model.Artifact.Evidence().Metadata.ModTime.UTC(),
				ClimateBuckets:  climateBucketCounts(model.Consumption, classifiedSession),
			}
			if !session.DefaultIncluded {
				session.ExclusionReason = UnusableReasonNoCompletedLap
			}
			if session.LastActivity.After(entry.LastActivity) {
				entry.LastActivity = session.LastActivity
			}
			for _, bucket := range session.ClimateBuckets {
				bucketTotals[bucket.Bucket] += bucket.Laps
			}
			entry.Sessions = append(entry.Sessions, session)
		}
		entry.ClimateBuckets = orderedBucketCounts(bucketTotals)
		result = append(result, entry)
	}
	return SessionCatalogListing{Combinations: result, Exclusions: exclusions}, nil
}

func climateBucketCounts(consumption *SessionConsumptionPace, classified ClassifiedSession) []ClimateBucketCount {
	if consumption == nil || consumption.SessionID != classified.SessionID || consumption.CombinationID != classified.Combination.ID {
		return []ClimateBucketCount{}
	}
	counts := map[strategyprojection.ClimateBucket]int{}
	for _, lap := range consumption.Laps {
		if lap.ClimateBucket != nil {
			counts[*lap.ClimateBucket]++
		}
	}
	return orderedBucketCounts(counts)
}

func orderedBucketCounts(counts map[strategyprojection.ClimateBucket]int) []ClimateBucketCount {
	result := make([]ClimateBucketCount, 0, len(counts))
	for _, bucket := range []strategyprojection.ClimateBucket{
		strategyprojection.ClimateBucketDry,
		strategyprojection.ClimateBucketHumid,
		strategyprojection.ClimateBucketWet,
	} {
		if counts[bucket] > 0 {
			result = append(result, ClimateBucketCount{Bucket: bucket, Laps: counts[bucket]})
		}
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].Bucket < result[j].Bucket })
	return result
}
