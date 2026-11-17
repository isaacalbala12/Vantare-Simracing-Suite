import { useMemo } from "react";
import type {
  AnalysisController,
  AnalysisSnapshot,
} from "../../app/AnalysisController";
import { biggestChanges } from "../../app/analysis-comparison";
import { analysisText, lapTime } from "../../i18n/analysis.es";
import {
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
  const end = data?.delta?.at(-1)?.value;
  const changes = useMemo(() => (data ? biggestChanges(data) : []), [data]);
  return (
    <>
      <RailBlock icon="pulse" title={t.summary}>
        <dl className="v-an-recording-meta">
          {[
            [t.line(t.a, a?.lap), lapTime(a?.lapTimeApproxMs)],
            [t.line(t.b, b?.lap), lapTime(b?.lapTimeApproxMs)],
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
        {changes.map((range) => (
          <Button
            key={range.from}
            variant="ghost"
            size="sm"
            className="v-an-change"
            aria-pressed={
              state.zoom?.[0] === range.from && state.zoom?.[1] === range.to
            }
            onClick={() => controller?.zoom([range.from, range.to])}
          >
            <span>{distanceInterval(range.from, range.to)}</span>
            <strong
              className={
                range.delta < 0 ? "v-an-compare-gain" : "v-an-compare-loss"
              }
            >
              {seconds(range.delta)}
            </strong>
          </Button>
        ))}
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
        <p>{analysisText.approximate}</p>
      </RailBlock>
    </>
  );
}
