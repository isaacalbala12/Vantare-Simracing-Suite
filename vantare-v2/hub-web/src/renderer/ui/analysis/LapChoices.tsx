import { useId } from "react";
import type { AnalysisLap } from "../../../contract/generated/analysis";
import type {
  AnalysisController,
  AnalysisSnapshot,
} from "../../app/AnalysisController";
import { comparable, timedLaps } from "../../app/analysis-comparison";
import { comparisonText as t } from "../../i18n/comparison.es";
import { Button } from "../Button";
import { RailBlock } from "../Frame";
export function LapChoices({
  lap,
  state,
  controller,
}: {
  lap: AnalysisLap;
  state: AnalysisSnapshot;
  controller?: AnalysisController;
}) {
  const id = useId();
  const disabled = !comparable(lap);
  return (
    <div className="v-an-choices">
      {(["a", "b"] as const).map((side) => (
        <Button
          key={side}
          size="sm"
          className={`v-an-choice v-an-series-${side}`}
          aria-label={t.select(t[side], lap.lap)}
          aria-pressed={state.pair?.[side] === lap.index}
          focusableWhenDisabled
          aria-disabled={disabled}
          aria-describedby={disabled ? id : undefined}
          onClick={() => controller?.select(side, lap.index)}
        >
          {t[side]}
        </Button>
      ))}
      {disabled && (
        <span id={id} className="v-sr-only">
          {t.unavailable}
        </span>
      )}
    </div>
  );
}
export function CompareAction({
  state,
  controller,
  quick = false,
}: {
  state: AnalysisSnapshot;
  controller?: AnalysisController;
  quick?: boolean;
}) {
  const id = useId();
  const disabled = quick
    ? timedLaps(state.opened?.laps ?? []).length < 2
    : state.pair?.a == null || state.pair.b == null;
  const content = (
    <div className="v-an-compare-action">
      {!quick && <small>{t.selectionHelp}</small>}
      <Button
        variant={quick ? "neutral" : "primary"}
        size="sm"
        focusableWhenDisabled
        aria-disabled={disabled}
        aria-describedby={disabled ? id : undefined}
        onClick={() => (quick ? controller?.bestPair() : controller?.compare())}
      >
        {quick ? t.quick : t.compare}
      </Button>
      {disabled && <small id={id}>{quick ? t.quickHelp : t.selectFirst}</small>}
    </div>
  );
  return quick ? (
    <RailBlock title={t.tab} icon="pulse">
      <p>{t.quickInfo}</p>
      {content}
    </RailBlock>
  ) : (
    content
  );
}
