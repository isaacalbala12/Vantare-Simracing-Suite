import { useEffect, useRef, useState } from "react";
import type {
  AnalysisController,
  AnalysisSnapshot,
} from "../../app/AnalysisController";
import { commonRanges, comparable } from "../../app/analysis-comparison";
import { recordingZone } from "../../app/analysis-dates";
import { validLapTime } from "../../app/analysis-laps";
import { Icon } from "../../assets/icons/Icon";
import { analysisText as at, recordingDateLabel } from "../../i18n/analysis.es";
import { metres, comparisonText as t } from "../../i18n/comparison.es";
import { Button, IconButton } from "../Button";
import { Callout, Spinner } from "../Data";
import { Segmented, Select } from "../Forms";
import { AnalysisError, AnalysisNotice, RecordingStrip } from "./Analysis";
import { ComparisonPlot, type PlotAxis } from "./ComparisonPlot";
import { useRecordingClock } from "./useRecordingClock";
import "./comparison.css";
export function Comparison({
  state,
  controller,
  enabled,
  updates,
  clock = Date.now,
  timeZone = recordingZone(),
}: {
  state: AnalysisSnapshot;
  controller?: AnalysisController;
  enabled: boolean;
  updates: () => void;
  clock?: () => number;
  timeZone?: string;
}) {
  const now = useRecordingClock(clock, timeZone);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const [time, setTime] = useState(false);
  const data = state.comparison;
  const laps = state.opened?.laps ?? [];
  const best = Math.min(...laps.map((lap) => validLapTime(lap) ?? Infinity));
  const distance = data?.distanceRange ?? [0, 1];
  const elapsed =
    [...(data?.speed.a ?? []), ...(data?.speed.b ?? [])]
      .filter(
        (point) =>
          point.elapsed !== null &&
          point.distance >= distance[0] &&
          point.distance <= distance[1],
      )
      .map((point) => point.elapsed ?? 0) ?? [];
  const axis: PlotAxis = {
    time,
    distance,
    range: time ? [Math.min(...elapsed, 0), Math.max(...elapsed, 1)] : distance,
  };
  const kind = state.compareError;
  const special =
    kind === "analysisIncomparable"
      ? "incomparable"
      : kind === "analysisCancelled"
        ? "cancelled"
        : kind === "analysisTimeout"
          ? "timeout"
          : undefined;
  return (
    <div className="v-an-layout v-an-comparison">
      <header className="v-an-heading">
        <IconButton label={t.back} onClick={() => controller?.showLaps()}>
          <Icon name="chevron-left" />
        </IconButton>
        <div>
          <p className="v-an-heading-meta">
            <em>{at.track}</em>
            {" · "}
            <em>{at.car}</em>
            {" · "}
            {state.selected
              ? recordingDateLabel(state.selected.startedAtMs, now, timeZone)
              : at.dash}
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {t.title}
          </h1>
        </div>
      </header>
      <RecordingStrip
        enabled={enabled}
        recording={state.rows.some((row) => row.recording)}
      />
      <div className="v-an-selectors">
        {(["a", "b"] as const).map((side, i) => (
          <div className={`v-an-selector v-an-series-${side}`} key={side}>
            <strong>{t[side]}</strong>
            <Select
              label={t[side]}
              hideLabel
              value={String(state.pair?.[side] ?? "")}
              onChange={(value) => controller?.select(side, Number(value))}
              options={laps.map((lap) => ({
                value: String(lap.index),
                disabled: !comparable(lap),
                label: `${t.lapOption(lap.lap, validLapTime(lap), lap.gap, validLapTime(lap) !== null && Number.isFinite(best) ? (validLapTime(lap) ?? 0) - best : null)}${comparable(lap) ? "" : ` · ${t.unavailable}`}`,
              }))}
            />
            {i === 0 && (
              <Button
                className="v-an-swap"
                aria-label={t.swap}
                onClick={() => {
                  if (state.pair?.b !== undefined)
                    controller?.select("a", state.pair.b);
                }}
              >
                {t.swapSymbol}
              </Button>
            )}
          </div>
        ))}
      </div>
      {kind ? (
        special ? (
          <div role="alert">
            <AnalysisNotice title={t[special]} help={t[`${special}Help`]}>
              <Button
                variant="primary"
                onClick={() =>
                  special === "incomparable"
                    ? controller?.showLaps()
                    : controller?.compare(true)
                }
              >
                {special === "incomparable" ? t.back : t.reopen}
              </Button>
            </AnalysisNotice>
          </div>
        ) : (
          <AnalysisError
            recording={false}
            kind={kind}
            back={() => controller?.load()}
            retry={() => controller?.compare(true)}
            updates={updates}
          />
        )
      ) : data ? (
        <>
          {data.delta === null && (
            <Callout tone="warn" title={t.noDelta}>
              {data.deltaUnavailable ? t[data.deltaUnavailable] : t.noDelta}
            </Callout>
          )}
          <div
            className="v-card v-an-trace-card"
            aria-busy={state.comparing || undefined}
          >
            <div className="v-an-trace-toolbar">
              <div className="v-an-legend">
                {(["a", "b"] as const).map((side) => (
                  <span key={side} className={`v-an-series-${side}`}>
                    {t.line(
                      t[side],
                      laps.find((lap) => lap.index === data[side])?.lap,
                    )}
                  </span>
                ))}
              </div>
              <Segmented
                label={t.axis}
                value={time ? "time" : "distance"}
                onChange={(value) => {
                  setTime(value === "time");
                }}
                options={[
                  { value: "distance", label: t.distance },
                  { value: "time", label: t.time },
                ]}
              />
            </div>
            <div
              className="v-an-traces"
              data-updating={state.comparing || undefined}
            >
              {(["speed", "throttle", "brake", "delta"] as const).map(
                (signal) => (
                  <ComparisonPlot
                    key={signal}
                    data={data}
                    signal={signal}
                    axis={axis}
                  />
                ),
              )}
            </div>
            {state.comparing && (
              <div className="v-an-comparing">
                <Spinner label={t.updating} />
                <Button
                  size="sm"
                  onClick={() => controller?.cancelComparison()}
                >
                  {at.cancel}
                </Button>
              </div>
            )}
            <p className="v-an-common">{`${t.common}: ${
              commonRanges(data)
                .map(([from, to]) => `${metres(from)} – ${metres(to)}`)
                .join(" · ") || at.dash
            }. ${data.delta ? t.direction : t.honesty}`}</p>
          </div>
        </>
      ) : (
        <AnalysisNotice title={t.loading} loading>
          <Button onClick={() => controller?.cancelComparison()}>
            {at.cancel}
          </Button>
        </AnalysisNotice>
      )}
    </div>
  );
}
