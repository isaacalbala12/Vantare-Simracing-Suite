import { Button } from "../../ui/orbit";
import type { RecordedCalculationState } from "./use-recorded-calculation";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";

export function StrategyRecordedPlan({ draft, state, locked, onChange, onCalculate, onCancel, t }: {
  readonly draft: RecordedWizardDraft;
  readonly state: RecordedCalculationState;
  readonly locked: boolean;
  readonly onChange: (draft: RecordedWizardDraft) => void;
  readonly onCalculate: () => void;
  readonly onCancel: () => void;
  readonly t: (key: string) => string;
}) {
  const running = state.status === "preparing" || state.status === "calculating" || state.status === "cancelling";
  const title = state.status === "success" ? "strategy.calculation.ready"
    : state.status === "error" ? "strategy.calculation.error"
      : state.status === "cancelled" ? "strategy.calculation.cancelled"
        : running ? "strategy.calculation.loading" : "strategy.workspace.notCalculated";
  return <section className="strategy-recorded-data" aria-labelledby="recorded-plan-title">
    <header className="strategy-recorded-data__heading"><h2 id="recorded-plan-title">{t("strategy.data.tab.plan")}</h2></header>
    <div className="strategy-recorded-data__observations">
      <h3>{t(title)}</h3>
      <label className="strategy-recorded-field">
        <span>{t("strategy.calculation.condition")}</span>
        <select value={draft.calculationMode ?? ""} disabled={locked || running} onChange={event => onChange({ ...draft, calculationMode: event.target.value === "" ? undefined : event.target.value as "dry" | "wet" })}>
          <option value="">{t("strategy.journey.choose")}</option>
          <option value="dry">{t("strategy.journey.climate.dry")}</option>
          <option value="wet">{t("strategy.journey.climate.wet")}</option>
        </select>
      </label>
      {state.status === "idle" ? <p>{t("strategy.workspace.calculateHint")}</p> : null}
      {running ? <p role="status">{t(state.status === "preparing" ? "strategy.calculation.preparingHint" : "strategy.calculation.loadingHint")}</p> : null}
      {state.status === "success" ? <p role="status">{t("strategy.calculation.readyHint")}</p> : null}
      {state.status === "cancelled" ? <p role="status">{t("strategy.calculation.cancelledHint")}</p> : null}
      {state.status === "error" ? <p role="alert" data-code={state.code} data-field={state.field}>{t("strategy.calculation.errorHint")}</p> : null}
      <div className="strategy-recorded-data__actions">
        {running ? <Button variant="ghost" disabled={state.status === "cancelling"} onClick={onCancel}>{t("strategy.recorded.cancel")}</Button>
          : <Button variant="primary" disabled={locked || !draft.calculationMode} onClick={onCalculate}>{t(state.status === "error" || state.status === "cancelled" ? "strategy.calculation.retry" : "strategy.workspace.calculate")}</Button>}
      </div>
    </div>
  </section>;
}
