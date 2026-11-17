import { useId } from "react";
import type { AnalysisPoint } from "../../../contract/generated/analysis";
import type { Compared } from "../../app/AnalysisController";
import { analysisText, decimal } from "../../i18n/analysis.es";
import { axisLabel, comparisonText as t } from "../../i18n/comparison.es";
export const plotLeft = 112,
  plotWidth = 640;
export type PlotAxis = {
  time: boolean;
  range: [number, number];
  distance: [number, number];
};
export function plotCoordinate(point: AnalysisPoint, time: boolean) {
  return time ? point.elapsed : point.distance;
}
export function tracePath(
  points: AnalysisPoint[],
  axis: PlotAxis,
  y: (n: number) => number,
) {
  let segment: number | undefined;
  return points
    .map((p) => {
      const value = plotCoordinate(p, axis.time);
      if (value === null) {
        segment = undefined;
        return "";
      }
      const x =
        plotLeft +
        ((value - axis.range[0]) / (axis.range[1] - axis.range[0] || 1)) *
          plotWidth;
      const command = segment === p.segment ? "L" : "M";
      segment = p.segment;
      return `${command}${x.toFixed(2)},${y(p.value).toFixed(2)}`;
    })
    .join(" ");
}
export function ComparisonPlot({
  data,
  signal,
  axis,
  cursor,
}: {
  data: Compared;
  signal: "speed" | "throttle" | "brake" | "delta";
  axis: PlotAxis;
  cursor?: number;
}) {
  const id = useId();
  const delta = signal === "delta";
  const height = signal === "speed" ? 164 : delta ? 140 : 96;
  const points = delta
    ? (data.delta ?? [])
    : [...data[signal].a, ...data[signal].b];
  const min = delta ? Math.min(-0.2, ...points.map((p) => p.value)) : 0;
  const max = delta
    ? Math.max(0.2, ...points.map((p) => p.value))
    : signal === "speed"
      ? Math.max(300, ...points.map((p) => p.value))
      : 100;
  const y = (n: number) => 10 + ((max - n) / (max - min)) * (height - 36);
  const x = (n: number) =>
    plotLeft +
    ((n - axis.range[0]) / (axis.range[1] - axis.range[0] || 1)) * plotWidth;
  const series = delta
    ? [["delta", data.delta ?? []] as const]
    : ([
        ["a", data[signal].a],
        ["b", data[signal].b],
      ] as const);
  const reason = data.deltaUnavailable ? t[data.deltaUnavailable] : t.noDelta;
  const step = Math.max(
    1000,
    Math.ceil((axis.range[1] - axis.range[0]) / 8000) * 1000,
  );
  const firstTick = Math.ceil(axis.range[0] / step) * step;
  const ticks = axis.time
    ? Array.from(
        { length: 7 },
        (_, i) => axis.range[0] + (i * (axis.range[1] - axis.range[0])) / 6,
      )
    : Array.from(
        {
          length: Math.max(
            0,
            Math.floor((axis.range[1] - firstTick) / step) + 1,
          ),
        },
        (_, i) => firstTick + i * step,
      );
  return (
    <svg
      className="v-an-trace"
      viewBox={`0 0 800 ${height}`}
      role="img"
      aria-label={t[signal]}
      aria-description={`${t.legend} ${axis.time ? t.timeHelp : t.direction} ${data.delta === null ? reason : ""}`}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect x={plotLeft} y={0} width={plotWidth} height={height - 20} />
        </clipPath>
        <linearGradient
          id={`${id}-delta`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={y(max)}
          x2="0"
          y2={y(min)}
        >
          <stop
            offset={`${(max / (max - min)) * 100}%`}
            className="v-an-loss-stop"
          />
          <stop
            offset={`${(max / (max - min)) * 100}%`}
            className="v-an-gain-stop"
          />
        </linearGradient>
      </defs>
      <text x={12} y={24} className="v-an-trace-label">
        {t[signal]}
      </text>
      <text x={12} y={height - 20}>
        {delta ? t.positive : signal === "speed" ? analysisText.kmh : "%"}
      </text>
      {[min, (min + max) / 2, max].map((tick) => (
        <g key={tick}>
          <line
            x1={plotLeft}
            x2={plotLeft + plotWidth}
            y1={y(tick)}
            y2={y(tick)}
            className="v-an-trace-grid"
          />
          <text x={plotLeft + plotWidth + 8} y={y(tick) + 4}>
            {delta ? tick.toFixed(1) : decimal(tick)}
          </text>
        </g>
      ))}
      {delta && data.delta === null ? (
        <g>
          <rect
            x={plotLeft}
            y={8}
            width={plotWidth}
            height={height - 40}
            className="v-an-empty-delta"
          />
          <text
            x={plotLeft + plotWidth / 2}
            y={height / 2 - 8}
            textAnchor="middle"
            className="v-an-trace-label"
          >
            {t.noDelta}
          </text>
          <foreignObject
            x={plotLeft + 16}
            y={height / 2}
            width={plotWidth - 32}
            height={48}
          >
            <p className="v-an-delta-reason">{reason}</p>
          </foreignObject>
        </g>
      ) : (
        <g clipPath={`url(#${id}-clip)`}>
          {[
            ...data.gaps.a.map((gap) => ({ ...gap, side: "a" as const })),
            ...data.gaps.b.map((gap) => ({ ...gap, side: "b" as const })),
          ].map((gap) => {
            const from = axis.time
              ? data.speed[gap.side]
                  .filter((p) => p.distance <= gap.from && p.elapsed !== null)
                  .at(-1)?.elapsed
              : gap.from;
            const to = axis.time
              ? data.speed[gap.side].find(
                  (p) => p.distance >= gap.to && p.elapsed !== null,
                )?.elapsed
              : gap.to;
            return from == null || to == null ? null : (
              <g key={`${gap.side}-${gap.from}-${gap.to}`}>
                <rect
                  x={x(from)}
                  y={8}
                  width={Math.max(0, x(to) - x(from))}
                  height={height - 30}
                  className="v-an-trace-gap"
                />
                <text x={x((from + to) / 2)} y={height / 2} textAnchor="middle">
                  {t.noData}
                </text>
              </g>
            );
          })}
          {delta &&
            points.every(
              (p, i) => i === 0 || p.segment === points[i - 1].segment,
            ) &&
            (!axis.time || points.every((p) => p.elapsed !== null)) &&
            [...new Set(points.map((p) => p.segment))].map((segment) => {
              const values = points.filter(
                (p) =>
                  p.segment === segment &&
                  plotCoordinate(p, axis.time) !== null,
              );
              const first = values[0],
                last = values.at(-1);
              return first && last ? (
                <path
                  key={segment}
                  className="v-an-delta-area"
                  fill={`url(#${id}-delta)`}
                  d={`${tracePath(values, axis, y)} L${x(plotCoordinate(last, axis.time) ?? 0)},${y(0)} L${x(plotCoordinate(first, axis.time) ?? 0)},${y(0)} Z`}
                />
              ) : null;
            })}
          {series.map(([side, values]) => (
            <path
              key={side}
              d={tracePath(values, axis, y)}
              className={`v-an-trace-line v-an-series-${side}`}
              style={delta ? { stroke: `url(#${id}-delta)` } : undefined}
            />
          ))}
          {cursor !== undefined && (
            <line
              x1={x(cursor)}
              x2={x(cursor)}
              y1={0}
              y2={height - 20}
              className="v-an-trace-cursor"
            />
          )}
        </g>
      )}
      {!delta &&
        series.map(([side, values]) => {
          const last = values
            .filter((p) => {
              const v = plotCoordinate(p, axis.time);
              return v !== null && v <= axis.range[1];
            })
            .at(-1);
          return last ? (
            <text
              key={side}
              x={Math.min(
                plotLeft + plotWidth - 16,
                x(plotCoordinate(last, axis.time) ?? 0) + 8,
              )}
              y={y(last.value) + (side === "a" ? -8 : 12)}
              className={`v-an-series-${side}`}
            >
              {side === "a" ? t.a : t.b}
            </text>
          ) : null;
        })}
      {delta &&
        (ticks.length ? ticks : axis.range).map((tick) => (
          <text key={tick} x={x(tick)} y={height - 2} textAnchor="middle">
            {axisLabel(tick, axis.time)}
          </text>
        ))}
    </svg>
  );
}
