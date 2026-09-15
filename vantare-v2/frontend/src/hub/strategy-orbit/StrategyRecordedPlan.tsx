import { useState } from "react";
import type { StrategyOrbitCalculatedPlanV1 } from "../../strategy/strategy-application-client";
import { Button } from "../../ui/orbit";
import { currentRecordedPlan } from "./strategy-recorded-result";
import { RECORDED_STINT_EDIT_VARIANT_ID, type RecordedStintConstraint } from "./strategy-recorded-stint-constraints";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";
import { StrategyRecordedStintEditor } from "./StrategyRecordedStintEditor";
import type { RecordedAcceptanceController } from "./use-recorded-acceptance";
import type { RecordedCalculationState } from "./use-recorded-calculation";
import "./strategy-recorded-plan.css";

const errorKey: Readonly<Record<string, string>> = {
  calculation_infeasible: "strategy.calculation.infeasibleHint",
  calculation_cancelled: "strategy.calculation.cancelledHint",
  calculation_timeout: "strategy.calculation.timeoutHint",
  calculation_overflow: "strategy.calculation.budgetHint",
};

function seconds(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor(rounded % 3600 / 60);
  const remainder = rounded % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function number(value: number, digits = 1): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}

function PlanResult({ plan, draft, t }: { readonly plan: StrategyOrbitCalculatedPlanV1; readonly draft: RecordedWizardDraft; readonly t: (key: string) => string }) {
  return <>
    <div className="strategy-recorded-plan__status" data-optimality={plan.optimality ?? "unknown"}>
      <strong>{t(plan.optimality === "proven" ? "strategy.calculation.optimal" : plan.optimality === "not_proven" ? "strategy.calculation.feasible" : "strategy.calculation.optimalityUnknown")}</strong>
      <span>{t(plan.optimality === "proven" ? "strategy.calculation.optimalHint" : plan.optimality === "not_proven" ? "strategy.calculation.feasibleHint" : "strategy.calculation.optimalityUnknownHint")}</span>
      {plan.modelVersion && plan.objective ? <small>{t("strategy.calculation.model")}: {plan.modelVersion} · {t("strategy.calculation.objective")}</small> : null}
    </div>
    <dl className="strategy-recorded-plan__summary">
      <div><dt>{t("strategy.plan.duration")}</dt><dd>{seconds(plan.total)}</dd></div>
      <div><dt>{t("strategy.plan.laps")}</dt><dd>{plan.totalLaps}</dd></div>
      <div><dt>{t("strategy.plan.stops")}</dt><dd>{plan.stops}</dd></div>
      <div><dt>{t("strategy.plan.reserve")}</dt><dd>{number(plan.reserveLaps, 2)} / {number(plan.reserveRequiredLaps, 2)}</dd></div>
    </dl>
    <ol className="strategy-recorded-plan__timeline">
      {plan.stints.map((stint, index) => <li key={`${stint.i}:${stint.lap0}`}>
        <article className="strategy-recorded-plan__stint">
          <header><span>{t("strategy.plan.stint")} {index + 1}</span><strong>{draft.drivers.find(driver => driver.id === stint.d)?.name || stint.d}</strong></header>
          <dl>
            <div><dt>{t("strategy.plan.lapRange")}</dt><dd>{stint.lap0}–{stint.lap1}</dd></div>
            <div><dt>{t("strategy.plan.pace")}</dt><dd>{seconds(stint.pace)}</dd></div>
            <div><dt>{t("strategy.plan.fuel")}</dt><dd>{number(stint.fuel)} L</dd></div>
            {stint.virtualEnergy === undefined ? null : <div><dt>{t("strategy.plan.virtualEnergy")}</dt><dd>{number(stint.virtualEnergy)}%</dd></div>}
          </dl>
        </article>
        {plan.stopDetails[index] ? <article className="strategy-recorded-plan__stop">
          <header><span>{t("strategy.plan.stop")} {index + 1}</span><strong>{t("strategy.plan.lap")} {plan.stopDetails[index].lap}</strong></header>
          <p>{t("strategy.plan.pitTime")}: {seconds(plan.stopDetails[index].pitLossSeconds)}</p>
          <p>{t("strategy.plan.fuel")}: {number(plan.stopDetails[index].fuelInLiters)} → {number(plan.stopDetails[index].fuelOutLiters)} L</p>
          {plan.stopDetails[index].virtualEnergyInPercent === undefined || plan.stopDetails[index].virtualEnergyOutPercent === undefined ? null
            : <p>{t("strategy.plan.virtualEnergy")}: {number(plan.stopDetails[index].virtualEnergyInPercent)} → {number(plan.stopDetails[index].virtualEnergyOutPercent)}%</p>}
        </article> : null}
      </li>)}
    </ol>
  </>;
}

export function StrategyRecordedPlan({ draft, state, acceptance, locked, onChange, onCalculate, onRecalculate, onCancel, t }: {
  readonly draft: RecordedWizardDraft;
  readonly state: RecordedCalculationState;
  readonly acceptance: RecordedAcceptanceController;
  readonly locked: boolean;
  readonly onChange: (draft: RecordedWizardDraft) => void;
  readonly onCalculate: () => void;
  readonly onRecalculate: (constraints: readonly RecordedStintConstraint[]) => void;
  readonly onCancel: () => void;
  readonly t: (key: string) => string;
}) {
  const [stintDirty, setStintDirty] = useState(false);
  const running = state.status === "preparing" || state.status === "calculating" || state.status === "cancelling";
  const plan = currentRecordedPlan(state);
  const basePlan = state.status === "success" ? state.result.plans["recorded-main"] : undefined;
  const stintComparison = state.status === "success" && state.input.activeVariantId === RECORDED_STINT_EDIT_VARIANT_ID
    ? state.result.comparisons["recorded-main"] : undefined;
  const accepting = acceptance.state.status === "accepting" || acceptance.state.status === "loading";
  const title = plan ? "strategy.calculation.ready"
    : state.status === "partial" ? "strategy.calculation.partial"
      : state.status === "error" ? "strategy.calculation.error"
        : state.status === "cancelled" ? "strategy.calculation.cancelled"
          : running ? "strategy.calculation.loading" : "strategy.workspace.notCalculated";
  return <section className="strategy-recorded-plan" aria-labelledby="recorded-plan-title">
    <header className="strategy-recorded-plan__heading">
      <div><p>{t("strategy.data.tab.plan")}</p><h2 id="recorded-plan-title">{t(title)}</h2></div>
      <label className="strategy-recorded-field">
        <span>{t("strategy.calculation.condition")}</span>
        <select value={draft.calculationMode ?? ""} disabled={locked || running || accepting} onChange={event => onChange({ ...draft, calculationMode: event.target.value === "" ? undefined : event.target.value as "dry" | "wet" })}>
          <option value="">{t("strategy.journey.choose")}</option>
          <option value="dry">{t("strategy.journey.climate.dry")}</option>
          <option value="wet">{t("strategy.journey.climate.wet")}</option>
        </select>
      </label>
    </header>
    {state.status === "idle" ? <p>{t("strategy.workspace.calculateHint")}</p> : null}
    {running ? <p role="status">{t(state.status === "preparing" ? "strategy.calculation.preparingHint" : "strategy.calculation.loadingHint")}</p> : null}
    {state.status === "partial" ? <div className="strategy-recorded-plan__partial" role="status">
      <h3>{t("strategy.calculation.partialHint")}</h3>
      <dl>
        {state.coverage.paceSeconds === undefined ? null : <div><dt>{t("strategy.plan.pace")}</dt><dd>{seconds(state.coverage.paceSeconds)}</dd></div>}
        {state.coverage.fuelLitersPerLap === undefined ? null : <div><dt>{t("strategy.plan.fuelPerLap")}</dt><dd>{number(state.coverage.fuelLitersPerLap, 2)} L</dd></div>}
        {state.coverage.virtualEnergyPercentPerLap === undefined ? null : <div><dt>{t("strategy.plan.virtualEnergyPerLap")}</dt><dd>{number(state.coverage.virtualEnergyPercentPerLap, 2)}%</dd></div>}
      </dl>
      <p>{state.coverage.blockers.map(blocker => t(`strategy.calculation.blocker.${blocker}`)).join(" · ")}</p>
    </div> : null}
    {plan ? <PlanResult plan={plan} draft={draft} t={t} /> : null}
    {stintComparison ? <div className="strategy-recorded-plan__cost" role="status"><strong>{t("strategy.stint.cost")}</strong><span>{-stintComparison.totalDeltaSeconds >= 0 ? "+" : ""}{number(-stintComparison.totalDeltaSeconds)} s</span><small>{t("strategy.stint.costHint")}</small></div> : null}
    {basePlan && plan ? <StrategyRecordedStintEditor key={JSON.stringify(plan.stints.map(stint => [stint.d, stint.laps]))} plan={plan} drivers={draft.drivers} locked={locked || accepting} onDirtyChange={setStintDirty} onRecalculate={constraints => { setStintDirty(false); onRecalculate(constraints); }} t={t} /> : null}
    {state.status === "cancelled" ? <p role="status">{t("strategy.calculation.cancelledHint")}</p> : null}
    {state.status === "error" ? <p role="alert" data-code={state.code} data-field={state.field}>{t(state.code && errorKey[state.code] ? errorKey[state.code] : "strategy.calculation.errorHint")}</p> : null}
    {state.status === "success" ? <section className="strategy-recorded-plan__sources"><h3>{t("strategy.plan.sources")}</h3><ul>{state.input.planningInputs?.projection?.sourceRevisions?.map(ref => <li key={ref.sessionId}><strong>{ref.sessionId}</strong><code>{ref.revisionId.slice(0, 12)}</code></li>)}</ul></section> : null}
    {acceptance.state.status === "accepted" && !stintDirty ? <p role="status">{t("strategy.plan.accepted")}</p> : null}
    {acceptance.state.status === "error" ? <p role="alert">{t("strategy.plan.acceptanceUnavailable")}</p> : null}
    {acceptance.state.status === "recovery" ? <div role="alert" className="strategy-recorded-plan__recovery"><p>{t("strategy.plan.acceptancePending")}</p><Button variant="ghost" onClick={() => void acceptance.resolve()}>{t("strategy.plan.checkAcceptance")}</Button><Button variant="ghost" onClick={() => void acceptance.retry()}>{t("strategy.plan.retryAcceptance")}</Button><Button variant="ghost" onClick={() => void acceptance.dismiss()}>{t("strategy.plan.dismissAcceptance")}</Button></div> : null}
    <footer className="strategy-recorded-plan__actions">
      <small>{t("strategy.plan.saveSeparate")}</small>
      {running ? <Button variant="ghost" disabled={state.status === "cancelling"} onClick={onCancel}>{t("strategy.recorded.cancel")}</Button>
        : <Button variant="ghost" disabled={locked || accepting || !draft.calculationMode} onClick={onCalculate}>{t(state.status === "error" || state.status === "cancelled" || state.status === "partial" ? "strategy.calculation.retry" : "strategy.workspace.calculate")}</Button>}
      {plan ? <Button variant="primary" disabled={locked || stintDirty || accepting || acceptance.state.status === "accepted" || acceptance.state.status === "recovery" || acceptance.state.status === "error"} onClick={() => void acceptance.accept()}>{t(accepting ? "strategy.plan.accepting" : "strategy.plan.accept")}</Button> : null}
    </footer>
  </section>;
}
