package telemetryanalysis

import (
	"context"
	"strings"
)

// ReadCorrectionTargetPages retains only the original rows named by a stored
// snapshot. The caller owns source authorization and must validate the entire
// snapshot against these rows and the original summary before using them.
func ReadCorrectionTargetPages(ctx context.Context, reader CorrectionInputReader, session HistoricalSession, corrections []PreparedSampleCorrection) ([]HistoricalPage, error) {
	if reader == nil || len(corrections) > MaxSampleCorrections {
		return nil, ErrInvalidCorrection
	}
	allowed := make(map[string]bool)
	for _, name := range RequiredHistoricalPageChannels() {
		allowed[name] = true
	}
	channels := make(map[string]HistoricalChannel, len(session.Channels))
	counts := make(map[string]int, len(session.Channels))
	for _, channel := range session.Channels {
		channels[channel.ID] = channel
		counts[channel.ID]++
	}
	type rowKey struct {
		channel string
		index   int64
	}
	seen := make(map[rowKey]bool, len(corrections))
	pages := make([]HistoricalPage, 0, len(corrections))
	for _, correction := range corrections {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		target := correction.Request.Target
		channel, ok := channels[target.ChannelID]
		if !ok || counts[target.ChannelID] != 1 || !allowed[strings.ToLower(strings.TrimSpace(channel.SourceName))] || target.SampleIndex < 0 {
			return nil, ErrCorrectionTarget
		}
		key := rowKey{target.ChannelID, target.SampleIndex}
		if seen[key] {
			continue
		}
		page, err := reader.ReadPage(ctx, target.ChannelID, target.SampleIndex, 1)
		if err != nil {
			return nil, err
		}
		if page.ChannelID != target.ChannelID || page.Start != target.SampleIndex || len(page.Samples) > 1 ||
			page.Sampling.Kind != channel.Sampling.Kind || page.Sampling.FrequencyHz != channel.Sampling.FrequencyHz {
			return nil, ErrInvalidHistoricalPage
		}
		if len(page.Samples) == 0 {
			return nil, ErrCorrectionTarget
		}
		if page.Samples[0].Index != target.SampleIndex {
			return nil, ErrInvalidHistoricalPage
		}
		seen[key] = true
		pages = append(pages, page)
	}
	return pages, ctx.Err()
}
