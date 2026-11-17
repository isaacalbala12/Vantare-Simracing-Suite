import { memo, useId, useMemo } from "react";
import type { AnalysisPoint } from "../../../contract/generated/analysis";
import type { Compared } from "../../app/AnalysisController";
import { windowPoints } from "../../app/analysis-comparison";
import { analysisText, decimal } from "../../i18n/analysis.es";
import {
  axisLabel,
  metres,
  comparisonText as t,
} from "../../i18n/comparison.es";
export const plotLeft = 112,
  plotWidth = 640;
export type PlotAxis = {
  time: boolean;
  range: [number, number];
  distance: [number, number];
  gaps: { from: number; to: number }[];
};
export function plotCoordinate(point: AnalysisPoint, time: boolean) {
  return time ? point.elapsed : point.distance;
}
export function tracePath(
  points: AnalysisPoint[],
  axis: Omit<PlotAxis, "gaps">,
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
type Signal = "speed" | "throttle" | "brake" | "delta";
function preparePlot(data: Compared, signal: Signal, axis: PlotAxis) {
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
  const visiblePoints = windowPoints(points, axis.distance);
  const series = delta
    ? [["delta", windowPoints(data.delta ?? [], axis.distance)] as const]
    : ([
        ["a", windowPoints(data[signal].a, axis.distance)],
        ["b", windowPoints(data[signal].b, axis.distance)],
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

  const paths = series.map(([side, values]) => ({
    side,
    d: tracePath(values, axis, y),
  }));
  const first = visiblePoints[0],
    last = visiblePoints.at(-1);
  const from = first ? plotCoordinate(first, axis.time) : null,
    to = last ? plotCoordinate(last, axis.time) : null;
  const area =
    delta &&
    first &&
    last &&
    from !== null &&
    to !== null &&
    visiblePoints.every((p) => p.segment === first.segment) &&
    (!axis.time || visiblePoints.every((p) => p.elapsed !== null))
      ? `${tracePath(visiblePoints, axis, y)} L${x(to)},${y(0)} L${x(from)},${y(0)} Z`
      : undefined;
  const labels = series.flatMap(([side, values]) => {
    if (side === "delta") return [];
    const last = values
      .filter((p) => {
        const coordinate = plotCoordinate(p, axis.time);
        return coordinate !== null && coordinate <= axis.range[1];
      })
      .at(-1);
    if (!last) return [];
    const coordinate = plotCoordinate(last, axis.time);
    if (coordinate === null) return [];
    return [
      {
        side,
        x: Math.min(plotLeft + plotWidth - 16, x(coordinate) + 8),
        y: Math.max(
          side === "a" ? 14 : 28,
          Math.min(height - 16, y(last.value) + (side === "a" ? -8 : 12)),
        ),
      },
    ];
  });
  return {
    delta,
    height,
    min,
    max,
    y,
    x,
    reason,
    ticks,
    paths,
    area,
    labels,
    gaps: axis.gaps,
  };
}
export const ComparisonPlot = memo(function ComparisonPlot({
  data,
  signal,
  axis,
}: {
  data: Compared;
  signal: Signal;
  axis: PlotAxis;
}) {
  const id = useId();
  const {
    delta,
    height,
    min,
    max,
    y,
    x,
    reason,
    ticks,
    paths,
    area,
    labels,
    gaps,
  } = useMemo(() => preparePlot(data, signal, axis), [data, signal, axis]);
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
          {gaps.map(({ from, to }) => (
            <g key={`${from}-${to}`}>
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
          ))}
          {area && (
            <path
              className="v-an-delta-area"
              fill={`url(#${id}-delta)`}
              d={area}
            />
          )}
          {paths.map(({ side, d }) => (
            <path
              key={side}
              d={d}
              className={`v-an-trace-line v-an-series-${side}`}
              style={delta ? { stroke: `url(#${id}-delta)` } : undefined}
            />
          ))}
          <line
            x1={0}
            x2={0}
            y1={0}
            y2={height - 20}
            className="v-an-trace-cursor"
          />
        </g>
      )}
      {labels.map(({ side, x, y }) => (
        <text key={side} x={x} y={y} className={`v-an-series-${side}`}>
          {t[side]}
        </text>
      ))}
      {delta &&
        (ticks.length >= 2 ? ticks : axis.range).map((tick) => (
          <text key={tick} x={x(tick)} y={height - 2} textAnchor="middle">
            {!axis.time && axis.distance[1] - axis.distance[0] < 1000
              ? metres(tick)
              : axisLabel(tick, axis.time)}
          </text>
        ))}
    </svg>
  );
});
