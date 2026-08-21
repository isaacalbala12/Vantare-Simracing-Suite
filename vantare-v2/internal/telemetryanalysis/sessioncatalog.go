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
	Consumption *SessionConsumptionPace
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

func (catalog *SessionCatalog) ListSessionCombinations(ctx context.Context) ([]CombinationCatalogEntry, error) {
	if catalog == nil || catalog.source == nil {
		return []CombinationCatalogEntry{}, nil
	}
	models, err := catalog.source.ListAuthorizedSessions(ctx)
	if err != nil {
		return nil, err
	}
	return ListAuthorizedSessionCombinations(ctx, models)
}

// ListAuthorizedSessionCombinations is the Analysis-owned application query.
// It classifies and groups only models carrying an unforgeable authorization
// token issued by BuildAuthorizedHistoricalArtifact.
func ListAuthorizedSessionCombinations(ctx context.Context, models []AuthorizedSessionModel) ([]CombinationCatalogEntry, error) {
	classified := make([]ClassifiedSession, 0, len(models))
	byID := make(map[string]AuthorizedSessionModel, len(models))
	for _, model := range models {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		manifest := model.Artifact.Manifest()
		if !validAuthorizedHistoricalArtifact(model.Artifact) ||
			model.Session.Provenance.Source != manifest.Source ||
			model.Session.Provenance.Parser != manifest.Parser ||
			strings.TrimSpace(model.Session.ID) == "" {
			return nil, ErrInvalidAuthorizedSession
		}
		item, err := ClassifyHistoricalSession(model.Session)
		if err != nil {
			return nil, err
		}
		if _, duplicate := byID[item.SessionID]; duplicate {
			return nil, ErrInvalidAuthorizedSession
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
	return result, nil
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
