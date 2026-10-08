package telemetryanalysis

import (
	"context"
	"errors"
	"math"
	"strings"
)

var ErrCorrectionReadLimit = errors.New("correction source exceeds the read budget")

// CorrectionInputReader is implemented by the authorized format parser. The
// owner must keep its artifact alive and revalidate it on every read. Each
// returned page must own its sample slice; the correction reader aligns it.
type CorrectionInputReader interface {
	Inspect(context.Context) (HistoricalSession, error)
	ReadPage(context.Context, string, int64, int) (HistoricalPage, error)
}

// Limits are backend resource budgets, never physical quality thresholds.
type CorrectionReadLimits struct{ PageRows, MaxSamples, MaxValues, MaxTextBytes int }
type CorrectionInput struct {
	Base     SourceAnalysisRef
	Session  HistoricalSession
	Pages    []HistoricalPage
	Validity LapValidityAnalysis
}

// The authorized parser supports indexed pages. After a full ordered bridge
// validation, callers can reread only the GPS windows needed by one continuous
// channel rather than retain the whole clock. The owning service holds the
// session lock and source lifetime while this cursor is used.
type orderedGPSPageLookup struct {
	reader   CorrectionInputReader
	channel  HistoricalChannel
	pageRows int
	page     HistoricalPage
}

func (lookup *orderedGPSPageLookup) timeAt(ctx context.Context, index int64) (float64, bool, error) {
	if err := ctx.Err(); err != nil {
		return 0, false, err
	}
	if lookup.reader == nil || lookup.pageRows <= 0 || lookup.pageRows > MaxLMUDuckDBPageRows || lookup.channel.ID == "" {
		return 0, false, ErrInvalidCorrectionSource
	}
	if index < 0 {
		return 0, false, nil
	}
	if lookup.page.ChannelID != lookup.channel.ID || index < lookup.page.Start || index-lookup.page.Start >= int64(len(lookup.page.Samples)) {
		page, err := lookup.reader.ReadPage(ctx, lookup.channel.ID, index, lookup.pageRows)
		if err != nil {
			return 0, false, err
		}
		if page.ChannelID != lookup.channel.ID || page.Start != index || len(page.Samples) > lookup.pageRows ||
			page.Sampling.Kind != SamplingContinuousImplicitFrequency || page.Sampling.FrequencyHz != lookup.channel.Sampling.FrequencyHz {
			return 0, false, ErrInvalidHistoricalPage
		}
		for offset, sample := range page.Samples {
			if sample.Index != index+int64(offset) || len(sample.Values) != 1 {
				return 0, false, ErrInvalidHistoricalPage
			}
			value, valid := numericHistoricalValue(sample.Values[0])
			if !valid || math.IsNaN(value) || math.IsInf(value, 0) {
				return 0, false, ErrInvalidHistoricalPage
			}
		}
		lookup.page = page
	}
	if len(lookup.page.Samples) == 0 {
		return 0, false, nil
	}
	value, _ := numericHistoricalValue(lookup.page.Samples[index-lookup.page.Start].Values[0])
	return value, true, nil
}

func ReadCorrectionInput(ctx context.Context, reader CorrectionInputReader, artifact AuthorizedHistoricalArtifact, limits CorrectionReadLimits) (CorrectionInput, error) {
	var empty CorrectionInput
	pages := []HistoricalPage{}
	session, err := VisitCorrectionPages(ctx, reader, artifact, limits, func(_ HistoricalChannel, page HistoricalPage) error {
		pages = append(pages, page)
		return nil
	})
	if err != nil {
		return empty, err
	}
	alignment := buildTemporalAlignmentOwned(session, pages)
	validity, err := AnalyzeAlignedLapValidity(alignment)
	if err != nil {
		return empty, err
	}
	base, err := CorrectionSourceFromModel(AuthorizedSessionModel{Artifact: artifact, Session: alignment.Session, Validity: &validity})
	if err != nil {
		return empty, err
	}
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	return CorrectionInput{Base: base, Session: alignment.Session, Pages: alignment.Pages, Validity: validity}, nil
}

// VisitCorrectionPages validates the authorized source and every page before
// passing it to visit. The visitor may process a page and release it; a later
// error invalidates the entire visit, so callers must not publish partial work.
func VisitCorrectionPages(ctx context.Context, reader CorrectionInputReader, artifact AuthorizedHistoricalArtifact, limits CorrectionReadLimits, visit func(HistoricalChannel, HistoricalPage) error) (HistoricalSession, error) {
	return visitCorrectionPages(ctx, reader, artifact, limits, "", "", visit)
}

// A later pass may select only the channels it needs after the first full
// visit has validated the source. Every selected page retains the same checks.
func visitCorrectionPages(ctx context.Context, reader CorrectionInputReader, artifact AuthorizedHistoricalArtifact, limits CorrectionReadLimits, only string, onlyKind SamplingKind, visit func(HistoricalChannel, HistoricalPage) error) (HistoricalSession, error) {
	var empty HistoricalSession
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	if reader == nil || visit == nil || !validAuthorizedHistoricalArtifact(artifact) {
		return empty, ErrInvalidCorrectionSource
	}
	if limits.PageRows <= 0 || limits.PageRows > MaxLMUDuckDBPageRows || limits.MaxSamples <= 0 || limits.MaxValues <= 0 || limits.MaxTextBytes <= 0 {
		return empty, ErrCorrectionReadLimit
	}
	session, err := reader.Inspect(ctx)
	if err != nil {
		return empty, err
	}
	manifest := artifact.Manifest()
	if session.SchemaVersion != HistoricalSchemaVersion || session.Provenance.Source != manifest.Source || session.Provenance.Parser != manifest.Parser {
		return empty, ErrInvalidCorrectionSource
	}
	wanted := make(map[string]bool)
	for _, name := range RequiredHistoricalPageChannels() {
		wanted[name] = true
	}
	samplesLeft, valuesLeft, textLeft := limits.MaxSamples, limits.MaxValues, limits.MaxTextBytes
	for _, channel := range session.Channels {
		name := strings.ToLower(strings.TrimSpace(channel.SourceName))
		if !wanted[name] || (only != "" && only != name) || (onlyKind != "" && onlyKind != channel.Sampling.Kind) {
			continue
		}
		for start := int64(0); ; {
			if err := ctx.Err(); err != nil {
				return empty, err
			}
			page, err := reader.ReadPage(ctx, channel.ID, start, limits.PageRows)
			if err != nil {
				return empty, err
			}
			if page.ChannelID != channel.ID || page.Start != start || len(page.Samples) > limits.PageRows {
				return empty, ErrInvalidHistoricalPage
			}
			if len(page.Samples) == 0 {
				break
			}
			if len(page.Samples) > samplesLeft {
				return empty, ErrCorrectionReadLimit
			}
			samplesLeft -= len(page.Samples)
			for i, sample := range page.Samples {
				if sample.Index != start+int64(i) {
					return empty, ErrInvalidHistoricalPage
				}
				if len(sample.Values) > valuesLeft {
					return empty, ErrCorrectionReadLimit
				}
				valuesLeft -= len(sample.Values)
				for _, v := range sample.Values {
					if len(v.Column) > textLeft {
						return empty, ErrCorrectionReadLimit
					}
					textLeft -= len(v.Column)
					if len(v.Scalar.Text) > textLeft {
						return empty, ErrCorrectionReadLimit
					}
					textLeft -= len(v.Scalar.Text)
				}
			}
			if err := visit(channel, page); err != nil {
				return empty, err
			}
			start += int64(len(page.Samples))
			if len(page.Samples) < limits.PageRows {
				break
			}
		}
	}
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	return session, nil
}
