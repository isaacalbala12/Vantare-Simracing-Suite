import type { StrategyTimeline } from "../../../contract/generated/strategy";
import { strategy } from "../../i18n/strategy";

const t = strategy.calc;
// 4 decimals of a percentage: finer than a pixel on any screen
const share = (laps: number, total: number) =>
  `${Number(((laps / total) * 100).toFixed(4))}%`;

// A tick every 1, 2, 5, 10, 20, 25, 50, 100… laps, as few as fit about four labels.
function ticks(total: number) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 5000];
  const step = steps.find((value) => total / value <= 4) ?? 10000;
  const marks = [];
  for (let lap = step; lap < total * 0.92; lap += step) marks.push(lap);
  return marks;
}

export type TimelineMark = { kind: "stint" | "stop"; index: number };

// The race to scale: one block per stint and a diamond where each stop is.
// `selected` lights the stint or stop being adjusted; `proposal` holds the laps
// the stops had in the calculated plan, and the ones that moved leave a ghost.
export function PlanTimeline({
  timeline,
  selected,
  proposal,
}: {
  timeline: StrategyTimeline;
  selected?: TimelineMark;
  proposal?: readonly number[];
}) {
  const { stints, pits } = timeline;
  const total = stints[stints.length - 1]?.toLap ?? 0;
  if (!total) return null;
  return (
    <div
      className="strategy-timeline"
      role="img"
      aria-label={t.timeline(stints.length, pits.length, total)}
    >
      <div className="strategy-timeline-bar">
        {stints.map((stint, index) => {
          const laps = stint.toLap - stint.fromLap + 1;
          return (
            <div
              key={stint.fromLap}
              className="strategy-stint"
              data-stint=""
              data-selected={
                selected?.kind === "stint" && selected.index === index
                  ? ""
                  : undefined
              }
              style={{
                left: share(stint.fromLap - 1, total),
                width: share(laps, total),
              }}
            >
              <b>{`S${index + 1}`}</b>
              <span>{`${laps} v`}</span>
            </div>
          );
        })}
        {pits.map((pit, index) => (
          <div
            key={pit.lap}
            className="strategy-stop"
            data-stop=""
            data-selected={selected?.index === index ? "" : undefined}
            style={{ left: share(pit.lap, total) }}
          >
            <i />
            <span>{`P${index + 1}`}</span>
          </div>
        ))}
        {pits.map((pit, index) => {
          const was = proposal?.[index];
          return was === undefined || was === pit.lap ? null : (
            <div
              key={`was-${was}`}
              className="strategy-stop"
              data-ghost=""
              aria-hidden="true"
              style={{ left: share(was, total) }}
            >
              <i />
            </div>
          );
        })}
      </div>
      <div className="strategy-timeline-axis">
        <span style={{ left: 0 }}>{1}</span>
        {ticks(total).map((lap) => (
          <span key={lap} style={{ left: share(lap, total) }}>
            {lap}
          </span>
        ))}
        <span style={{ right: 0 }}>{total}</span>
      </div>
    </div>
  );
}
