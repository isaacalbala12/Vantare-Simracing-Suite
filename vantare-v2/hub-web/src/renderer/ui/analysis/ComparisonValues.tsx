import { useId } from "react";
import type { Compared } from "../../app/AnalysisController";
import {
  type DistanceWindow,
  pointAt,
  windowPoints,
} from "../../app/analysis-comparison";
import { analysisText as at } from "../../i18n/analysis.es";
import {
  axisLabel,
  compareValue,
  metres,
  seconds,
  comparisonText as t,
} from "../../i18n/comparison.es";

const signals = ["speed", "throttle", "brake"] as const;
export function valuesAt(
  data: Compared,
  coordinate: number,
  time = false,
  window?: DistanceWindow,
) {
  const read = (points: Parameters<typeof pointAt>[0]) =>
    pointAt(window ? windowPoints(points, window) : points, coordinate, time);
  return signals
    .flatMap((signal) =>
      (["a", "b"] as const).map((side) => ({
        label: `${t[signal]} ${t[side]}`,
        side,
        value: compareValue(
          read(data[signal][side])?.value,
          signal === "speed" ? at.kmh : "%",
        ),
      })),
    )
    .concat({
      label: t.delta,
      side: "a",
      value: seconds(read(data.delta ?? [])?.value),
    });
}
export function cursorDescription(
  data: Compared,
  coordinate: number,
  time: boolean,
  window?: DistanceWindow,
) {
  return `${time ? axisLabel(coordinate, true) : metres(coordinate)} · ${valuesAt(
    data,
    coordinate,
    time,
    window,
  )
    .map(
      ({ label, value }) => `${label}: ${value === at.dash ? t.noData : value}`,
    )
    .join(" · ")}`;
}
export function ComparisonValues({
  data,
  coordinate,
  time,
  window,
}: {
  data: Compared;
  coordinate: number;
  time: boolean;
  window?: DistanceWindow;
}) {
  return (
    <div className="v-an-cursor-values">
      <p>{time ? axisLabel(coordinate, true) : metres(coordinate)}</p>
      <dl>
        {valuesAt(data, coordinate, time, window).map(
          ({ label, value, side }) => (
            <div key={label}>
              <dt
                className={
                  label === t.delta ? undefined : `v-an-series-${side}`
                }
              >
                {label}
              </dt>
              <dd>{value}</dd>
            </div>
          ),
        )}
      </dl>
    </div>
  );
}
const gapNotes = (data: Compared) =>
  (["a", "b"] as const).flatMap((side) =>
    data.gaps[side].map(({ from, to }) => t.gapNotice(from, to, t[side])),
  );
export function ComparisonGapNotes({ data }: { data: Compared }) {
  const notes = gapNotes(data);
  return notes.length ? (
    <p className="v-an-common v-an-gap-notes" role="status">
      {notes.join(". ")}
    </p>
  ) : null;
}
export function ComparisonTable({ data }: { data: Compared }) {
  const help = useId();
  const rows: number[] = [];
  const step = 1000;
  for (
    let distance = Math.ceil(data.distanceRange[0] / step) * step;
    distance <= data.distanceRange[1];
    distance += step
  )
    rows.push(distance);
  return (
    <details className="v-an-values-table">
      <summary>{t.table}</summary>
      <p id={help}>
        {[
          t.tableHelp,
          ...gapNotes(data).map((note) => `${note}.`),
          data.deltaUnavailable ? t[data.deltaUnavailable] : "",
        ]
          .filter(Boolean)
          .join(" ")}
      </p>
      <section
        className="v-an-tablewrap"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: A scrollable table region needs keyboard focus, verified by axe.
        tabIndex={0}
        aria-label={t.table}
        aria-describedby={help}
      >
        <table className="v-table" aria-describedby={help}>
          <caption className="v-sr-only">{t.table}</caption>
          <thead>
            <tr>
              {[
                t.distance,
                ...valuesAt(data, data.distanceRange[0]).map((v) => v.label),
              ].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((distance) => (
              <tr key={distance}>
                <th scope="row">{metres(distance)}</th>
                {valuesAt(data, distance).map(({ label, value }) => (
                  <td
                    key={label}
                    aria-label={value === at.dash ? t.noData : undefined}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </details>
  );
}
