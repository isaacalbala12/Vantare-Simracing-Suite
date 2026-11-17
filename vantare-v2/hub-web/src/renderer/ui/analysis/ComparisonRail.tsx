import type { AnalysisSnapshot } from "../../app/AnalysisController";
import { analysisText, lapTime } from "../../i18n/analysis.es";
import { seconds, comparisonText as t } from "../../i18n/comparison.es";
import { RailBlock } from "../Frame";
export function ComparisonRail({ state }: { state: AnalysisSnapshot }) {
  const data = state.compareError ? undefined : state.comparison;
  const pair = data ?? state.pair;
  const laps = state.opened?.laps ?? [];
  const a = laps.find((lap) => lap.index === pair?.a),
    b = laps.find((lap) => lap.index === pair?.b);
  const end = data?.delta?.at(-1)?.value;
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
      <RailBlock icon="pulse" title={t.how}>
        <p>{t.legend}</p>
        <p>{t.timeHelp}</p>
        <p>{analysisText.approximate}</p>
      </RailBlock>
    </>
  );
}
