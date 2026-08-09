import { useEffect, useMemo, useState } from "react";
import type { Calendar } from "../../calendar/calendar-types";
import {
  buildUpcomingRaceItems,
  countdownUrgency,
  formatCountdown,
  groupUpcomingByTier,
  msUntilStart,
  type CountdownUrgency,
  type UpcomingRaceItem,
} from "./calendar-upcoming";
import {
  formatTimeInZone,
  tierBadgeStyle,
  tierLabel,
  tierStyle,
} from "./calendar-shared";

export type CalendarUpcomingViewProps = {
  calendar: Calendar;
  timeZone: string;
  /** Injected in tests so the countdown is deterministic. */
  now?: Date;
  onRaceClick?: (item: UpcomingRaceItem) => void;
};

/** How often the countdowns re-render. One second, because seconds are shown. */
const TICK_MS = 1000;

const URGENCY_COLOR: Record<CountdownUrgency, string> = {
  live: "#22c55e",
  imminent: "#ff3b3b",
  soon: "#f59e0b",
  later: "#B8BFC8",
  unknown: "#6b7280",
};

/**
 * The countdown view: every race that has not started yet, soonest first.
 *
 * This is the question a driver actually asks — "what can I join, and when?" —
 * which neither the month grid nor a timeline answers without reading an axis.
 */
export function CalendarUpcomingView({
  calendar,
  timeZone,
  now: fixedNow,
  onRaceClick,
}: CalendarUpcomingViewProps) {
  const [tick, setTick] = useState(() => fixedNow ?? new Date());

  useEffect(() => {
    // A fixed now is a test harness pinning time; do not start a timer.
    if (fixedNow) return;
    const id = setInterval(() => setTick(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, [fixedNow]);

  const now = fixedNow ?? tick;

  const groups = useMemo(() => {
    const items = buildUpcomingRaceItems(calendar, now);
    // Anything already finished is noise here; the month view is where you go
    // looking backwards.
    const pending = items.filter((i) => i.isActive || (msUntilStart(i, now) ?? -1) > 0);
    return groupUpcomingByTier(pending);
  }, [calendar, now]);

  if (groups.length === 0) {
    return (
      <div
        data-testid="calendar-upcoming-empty"
        className="flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.01] p-8 text-center text-sm text-vantare-textMuted"
      >
        No hay carreras programadas. Importa el horario semanal para verlas aquí.
      </div>
    );
  }

  return (
    <div
      data-testid="calendar-upcoming"
      className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1"
    >
      {groups.map((group) => (
        <section key={group.tier} data-testid={`calendar-upcoming-tier-${group.tier}`}>
          <header className="mb-2 flex items-center gap-2">
            <span
              className="rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
              style={tierBadgeStyle(tierStyle(group.tier).accent)}
            >
              {tierLabel(group.tier)}
            </span>
            <span className="text-[11px] text-vantare-textMuted">
              {group.items.length} {group.items.length === 1 ? "carrera" : "carreras"}
            </span>
          </header>

          <div className="flex flex-col gap-2">
            {group.items.map((item) => (
              <UpcomingRow
                key={item.id}
                item={item}
                now={now}
                timeZone={timeZone}
                onClick={onRaceClick}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function UpcomingRow({
  item,
  now,
  timeZone,
  onClick,
}: {
  item: UpcomingRaceItem;
  now: Date;
  timeZone: string;
  onClick?: (item: UpcomingRaceItem) => void;
}) {
  const urgency = countdownUrgency(item, now);
  const countdown = item.isActive ? "en curso" : formatCountdown(msUntilStart(item, now));
  const color = URGENCY_COLOR[urgency];
  const start = item.nextStart ? new Date(item.nextStart) : null;

  return (
    <button
      type="button"
      data-testid={`calendar-upcoming-row-${item.id}`}
      onClick={() => onClick?.(item)}
      className="flex w-full items-stretch gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/[0.05]"
    >
      {/* The countdown is the reason this view exists, so it leads the row. */}
      <div className="flex w-24 shrink-0 flex-col items-center justify-center rounded-md bg-black/30 px-2 py-1">
        <span
          data-testid={`calendar-upcoming-countdown-${item.id}`}
          className="text-base font-extrabold tabular-nums"
          style={{ color }}
        >
          {countdown ?? "—"}
        </span>
        {start && (
          <span className="text-[10px] text-vantare-textMuted tabular-nums">
            {formatTimeInZone(start, timeZone)}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-bold text-vantare-text">{item.name}</span>
          <span className="truncate text-xs text-vantare-textMuted">{item.track}</span>
        </div>

        <ClassChips item={item} />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-vantare-textMuted">
          <span>{item.durationMin}m</span>
          {item.setup && <span>{item.setup === "fixed" ? "Setup fijo" : "Setup libre"}</span>}
          {item.splits ? <span>{item.splits} splits</span> : null}
          {item.tyres ? <span>{item.tyres} juegos</span> : null}
          <span>{item.tyreWarmers ? "Calentadores" : "Sin calentadores"}</span>
          {item.assists && <span>{item.assists}</span>}
        </div>
      </div>

      <RuleBadges item={item} />
    </button>
  );
}

/**
 * The eligible classes, each with the restriction that applies to it. This is
 * the "what" of the race: whether you can enter at all, and in what.
 */
function ClassChips({ item }: { item: UpcomingRaceItem }) {
  if (!item.classes || item.classes.length === 0) {
    return item.vehicleClass ? (
      <span className="truncate text-[11px] text-vantare-textMuted">{item.vehicleClass}</span>
    ) : null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {item.classes.map((cls) => (
        <span
          key={`${cls.name}-${cls.qualifier ?? ""}`}
          data-testid={`calendar-upcoming-class-${item.id}-${cls.name}`}
          className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-vantare-text"
        >
          {cls.name}
          {cls.qualifier && (
            <span className="ml-1 font-normal text-vantare-textMuted">{cls.qualifier}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/** The rules that change how a race is driven, kept out of the prose. */
function RuleBadges({ item }: { item: UpcomingRaceItem }) {
  const badges: string[] = [];
  if (item.timeScale && item.timeScale > 1) badges.push(`${item.timeScale}x`);
  if (item.veLimit) badges.push(`VE ${item.veLimit}%`);
  if (item.safetyRating) badges.push(item.safetyRating);

  if (badges.length === 0 && (!item.notes || item.notes.length === 0)) return null;

  return (
    <div className="flex w-20 shrink-0 flex-col items-end justify-center gap-1">
      {badges.map((badge) => (
        <span
          key={badge}
          className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-vantare-text"
        >
          {badge}
        </span>
      ))}
      {item.notes && item.notes.length > 0 && (
        <span
          data-testid={`calendar-upcoming-note-${item.id}`}
          title={item.notes.join("\n\n")}
          className="cursor-help text-[10px] font-bold text-vantare-red-400"
        >
          Aviso
        </span>
      )}
    </div>
  );
}
