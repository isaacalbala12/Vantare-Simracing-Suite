import { useEffect, useMemo, useState } from "react";
import type { Calendar } from "../../calendar/calendar-types";
import {
  buildTimelineRows,
  buildTimelineTicks,
  buildTimelineWindow,
  nowMarkerPct,
  type TimelineRow,
} from "./calendar-timeline";
import { formatTimeInZone, tierLabel, tierStyle } from "./calendar-shared";

export type CalendarTimelineViewProps = {
  calendar: Calendar;
  timeZone: string;
  /** Hours of track shown at once. */
  hours?: number;
  /** Injected in tests so the window and the now marker are deterministic. */
  now?: Date;
  onSeriesClick?: (seriesId: string) => void;
};

/** The now marker only needs to be roughly live; a minute is plenty. */
const TICK_MS = 60_000;

const DEFAULT_HOURS = 12;

/**
 * The density view: one row per series, hours across the top, a block per race.
 *
 * Where the countdown view answers "what do I join next", this one answers
 * "what does the day look like" — which series overlap, where the gaps are, and
 * how a 20 minute sprint compares to a 144 minute Le Mans on the same axis.
 */
export function CalendarTimelineView({
  calendar,
  timeZone,
  hours = DEFAULT_HOURS,
  now: fixedNow,
  onSeriesClick,
}: CalendarTimelineViewProps) {
  const [tick, setTick] = useState(() => fixedNow ?? new Date());

  useEffect(() => {
    if (fixedNow) return;
    const id = setInterval(() => setTick(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, [fixedNow]);

  const now = fixedNow ?? tick;

  const window = useMemo(() => buildTimelineWindow(now, hours, timeZone), [now, hours, timeZone]);
  const ticks = useMemo(() => buildTimelineTicks(window), [window]);
  const rows = useMemo(() => buildTimelineRows(calendar, window), [calendar, window]);
  const markerPct = nowMarkerPct(window, now);

  if (rows.length === 0) {
    return (
      <div
        data-testid="calendar-timeline-empty"
        className="flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.01] p-8 text-center text-sm text-vantare-textMuted"
      >
        No hay series en el calendario. Importa el horario semanal para verlas aquí.
      </div>
    );
  }

  return (
    <div
      data-testid="calendar-timeline"
      className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.01]"
    >
      <div className="flex-1 overflow-auto" style={{ scrollbarWidth: "thin" }}>
        <div className="min-w-[900px]">
          {/* Hour header. The label column is fixed so the track starts at the
              same x on every row. */}
          <div className="sticky top-0 z-10 flex border-b border-white/10 bg-[#0c0c0e]">
            <div className="w-52 shrink-0 border-r border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted">
              Serie
            </div>
            <div className="relative flex-1">
              {ticks.map((t) => (
                <span
                  key={t.ms}
                  className="absolute top-0 -translate-x-1/2 py-2 text-[10px] tabular-nums text-vantare-textMuted"
                  style={{ left: `${t.leftPct}%` }}
                >
                  {formatTimeInZone(new Date(t.ms), timeZone)}
                </span>
              ))}
              <div className="py-2 text-[10px] opacity-0" aria-hidden="true">
                .
              </div>
            </div>
          </div>

          {rows.map((row) => (
            <TimelineRowView
              key={row.seriesId}
              row={row}
              ticks={ticks.map((t) => t.leftPct)}
              markerPct={markerPct}
              timeZone={timeZone}
              onClick={onSeriesClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineRowView({
  row,
  ticks,
  markerPct,
  timeZone,
  onClick,
}: {
  row: TimelineRow;
  ticks: number[];
  markerPct: number | null;
  timeZone: string;
  onClick?: (seriesId: string) => void;
}) {
  const style = tierStyle(row.tier);

  return (
    <div
      data-testid={`calendar-timeline-row-${row.seriesId}`}
      className="flex border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]"
    >
      <button
        type="button"
        onClick={() => onClick?.(row.seriesId)}
        className="flex w-52 shrink-0 flex-col items-start gap-0.5 border-r border-white/10 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: style.accent }}
            title={tierLabel(row.tier)}
          />
          <span className="truncate text-xs font-bold text-vantare-text">{row.name}</span>
        </span>
        <span className="truncate text-[10px] text-vantare-textMuted">{row.track}</span>
      </button>

      <div className="relative min-h-[38px] flex-1">
        {/* Hour separators, drawn behind the blocks. */}
        {ticks.map((left) => (
          <div
            key={left}
            className="absolute inset-y-0 w-px bg-white/5"
            style={{ left: `${left}%` }}
            aria-hidden="true"
          />
        ))}

        {row.blocks.map((block) => (
          <div
            key={block.id}
            data-testid={`calendar-timeline-block-${block.id}`}
            title={`${row.name} · ${formatTimeInZone(new Date(block.startMs), timeZone)}`}
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm"
            style={{
              left: `${block.leftPct}%`,
              // Sub-pixel blocks are invisible; a 20 minute race inside a 12
              // hour window is under 3%, so give every block a floor.
              width: `max(${block.widthPct}%, 3px)`,
              background: style.accent,
              opacity: 0.85,
            }}
          />
        ))}

        {markerPct !== null && (
          <div
            data-testid={`calendar-timeline-now-${row.seriesId}`}
            className="pointer-events-none absolute inset-y-0 z-[5] w-px bg-vantare-red-500"
            style={{ left: `${markerPct}%` }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
