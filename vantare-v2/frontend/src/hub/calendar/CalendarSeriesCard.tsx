import type { RaceSeries, RaceSeriesPreview } from "../../calendar/calendar-types";
import { tierLabel, TIER_ACCENT } from "./calendar-tier";

export type CalendarSeriesCardProps = {
  series: RaceSeries;
  preview?: RaceSeriesPreview;
  isFollowed?: boolean;
  onFollow?: (seriesId: string) => void;
  onUnfollow?: (seriesId: string) => void;
};

function TierBadge({ tier }: { tier: string }) {
  const accent = TIER_ACCENT[tier] ?? "bg-white/40";
  return (
    <span
      className={`inline-block w-3 h-3 rounded-full mt-1 shrink-0 ${accent}`}
      aria-label={tierLabel(tier)}
    />
  );
}

export function CalendarSeriesCard({ series, preview, isFollowed, onFollow, onUnfollow }: CalendarSeriesCardProps) {
  const scheduleLabel = preview?.scheduleLabel;
  const nextStarts = preview?.nextStarts;

  return (
    <article
      className="card-sleek rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.14] transition-all duration-300"
      data-testid={`calendar-series-card-${series.id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm text-white leading-tight">{series.name}</h3>
          {series.track ? (
            <p className="text-[11px] text-vantare-textMuted mt-0.5 truncate">{series.track}</p>
          ) : null}
        </div>
        <TierBadge tier={series.tier} />
      </div>

      {/* Vehicle class and setup — prominent */}
      {(series.vehicleClass || series.setup) && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {series.vehicleClass ? (
            <span
              className="text-[11px] font-bold text-vantare-text bg-white/[0.06] px-2 py-0.5 rounded"
              data-testid={`series-${series.id}-class`}
            >
              {series.vehicleClass}
            </span>
          ) : null}
          {series.setup ? (
            <span
              className="text-[11px] font-bold text-vantare-textMuted bg-white/[0.04] px-2 py-0.5 rounded"
              data-testid={`series-${series.id}-setup`}
            >
              {series.setup}
            </span>
          ) : null}
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mb-2.5 text-[10px] font-mono">
        {series.durationMin > 0 ? (
          <span data-testid={`series-${series.id}-duration`}>{series.durationMin} min</span>
        ) : null}
        {series.splits > 0 ? (
          <span data-testid={`series-${series.id}-splits`}>{series.splits} splits</span>
        ) : null}
        {series.assists ? (
          <span data-testid={`series-${series.id}-assists`}>{series.assists}</span>
        ) : null}
        {series.tyreWarmers ? (
          <span data-testid={`series-${series.id}-tyrewarmers`}>Tyre warmers</span>
        ) : null}
        {series.tyres > 0 ? (
          <span data-testid={`series-${series.id}-tyres`}>{series.tyres} neum.</span>
        ) : null}
      </div>

      {/* Schedule label as badge */}
      <div className="mb-1.5">
        {scheduleLabel ? (
          <span
            className="text-[10px] font-semibold text-vantare-textMuted bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded"
            data-testid={`series-${series.id}-schedule`}
          >
            {scheduleLabel}
          </span>
        ) : (
          <span
            className="text-[10px] font-semibold text-amber-400/80"
            data-testid={`series-${series.id}-schedule-pending`}
          >
            Horario pendiente
          </span>
        )}
      </div>

      {/* Next starts as chips */}
      {nextStarts && nextStarts.length > 0 ? (
        <div
          className="flex flex-wrap gap-1"
          data-testid={`series-${series.id}-nextstarts`}
        >
          {nextStarts.map((s, i) => (
            <span
              key={i}
              className="text-[9px] font-mono text-vantare-textDim bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded"
            >
              {s}
            </span>
          ))}
        </div>
      ) : null}

      {/* Follow / Unfollow */}
      {isFollowed !== undefined && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-2">
          {isFollowed ? (
            <>
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                data-testid={`series-following-badge-${series.id}`}
                aria-label={`Siguiendo ${series.name}`}
              >
                Siguiendo
              </span>
              <button
                type="button"
                onClick={() => onUnfollow?.(series.id)}
                className="px-2.5 py-1 rounded-md text-[10px] font-bold text-vantare-textMuted bg-white/5 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
                data-testid={`series-unfollow-btn-${series.id}`}
                aria-pressed="true"
                aria-label={`Dejar de seguir serie ${series.name}`}
              >
                Dejar de seguir
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onFollow?.(series.id)}
              className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-vantare-red-600 hover:bg-vantare-red-500 text-white transition-colors"
              data-testid={`series-follow-btn-${series.id}`}
              aria-pressed="false"
              aria-label={`Seguir serie ${series.name}`}
            >
              Seguir serie
            </button>
          )}
        </div>
      )}
    </article>
  );
}
