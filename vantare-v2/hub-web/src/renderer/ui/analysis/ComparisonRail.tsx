import { useMemo } from "react";
import type {
  AnalysisController,
  AnalysisSnapshot,
} from "../../app/AnalysisController";
import { biggestChanges } from "../../app/analysis-comparison";
import { lapTime } from "../../app/analysis-laps";
import { analysisText, lapTime as formatLapTime } from "../../i18n/analysis.es";
import {
  changeSeconds,
  distanceInterval,
  seconds,
  comparisonText as t,
} from "../../i18n/comparison.es";
import { Button } from "../Button";
import { RailBlock } from "../Frame";
export function ComparisonRail({
  state,
  controller,
}: {
  state: AnalysisSnapshot;
  controller?: AnalysisController;
}) {
  const data = state.compareError ? undefined : state.comparison;
  const pair = data ?? state.pair;
  const laps = state.opened?.laps ?? [];
  const a = laps.find((lap) => lap.index === pair?.a),
    b = laps.find((lap) => lap.index === pair?.b);
  const timeA = lapTime(a);
  const timeB = lapTime(b);
  const approximate = [timeA, timeB].some(
    ({ ms, official }) => ms !== null && !official,
  );
  const end = data?.delta?.at(-1)?.value;
  const changes = useMemo(() => (data ? biggestChanges(data) : []), [data]);
  return (
    <>
      <RailBlock icon="pulse" title={t.summary}>
        <dl className="v-an-recording-meta">
          {[
            [t.line(t.a, a?.lap), formatLapTime(timeA.ms, timeA.official)],
            [t.line(t.b, b?.lap), formatLapTime(timeB.ms, timeB.official)],
            [t.difference, seconds(end)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p>
          {state.comparing && !data
            ? t.loading
            : end == null
              ? t.noDelta
              : end > 0
                ? t.slower
                : end < 0
                  ? t.faster
                  : t.equal}
        </p>
      </RailBlock>
      <RailBlock icon="pulse" title={t.changes}>
        {changes.length > 0 && (
          <ul className="v-an-changes" aria-label={t.changes}>
            {changes.map((range) => (
              <li key={range.from}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="v-an-change"
                  aria-pressed={
                    state.zoom?.[0] === range.from &&
                    state.zoom?.[1] === range.to
                  }
                  onClick={() => controller?.zoom([range.from, range.to])}
                >
                  <span>{distanceInterval(range.from, range.to)}</span>
                  <span
                    className={
                      range.delta < 0
                        ? "v-an-compare-gain"
                        : range.delta > 0
                          ? "v-an-compare-loss"
                          : undefined
                    }
                  >
                    {changeSeconds(range.delta)}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p>
          {state.comparing && !data
            ? t.loading
            : changes.length
              ? t.changesHelp
              : t.noDelta}
        </p>
        {state.zoom && (
          <Button onClick={() => controller?.zoom()}>{t.whole}</Button>
        )}
      </RailBlock>
      <RailBlock icon="pulse" title={t.how}>
        <p>{t.legend}</p>
        <p>{t.timeHelp}</p>
        {approximate && <p>{analysisText.approximate}</p>}
      </RailBlock>
    </>
  );
}
