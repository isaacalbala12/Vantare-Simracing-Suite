package telemetryanalysis

import (
	"context"
	"errors"
	"strings"
)

var ErrCorrectionReadLimit = errors.New("correction source exceeds the read budget")

// CorrectionInputReader is implemented by the authorized format parser. The
// owner must keep its artifact alive and revalidate it on every read.
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

func ReadCorrectionInput(ctx context.Context, reader CorrectionInputReader, artifact AuthorizedHistoricalArtifact, limits CorrectionReadLimits) (CorrectionInput, error) {
	var empty CorrectionInput
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	if reader == nil || !validAuthorizedHistoricalArtifact(artifact) {
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
	pages := []HistoricalPage{}
	samplesLeft, valuesLeft, textLeft := limits.MaxSamples, limits.MaxValues, limits.MaxTextBytes
	for _, channel := range session.Channels {
		if !wanted[strings.ToLower(strings.TrimSpace(channel.SourceName))] {
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
			pages = append(pages, page)
			start += int64(len(page.Samples))
			if len(page.Samples) < limits.PageRows {
				break
			}
		}
	}
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	alignment := BuildTemporalAlignment(session, pages)
	validity, err := analyzeAlignedLapValidity(alignment)
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
