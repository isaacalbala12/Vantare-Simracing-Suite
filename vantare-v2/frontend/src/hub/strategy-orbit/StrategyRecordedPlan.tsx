import { useState } from "react";
import type { StrategyOrbitCalculatedPlanV1 } from "../../strategy/strategy-application-client";
import { Button } from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { currentRecordedPlan } from "./strategy-recorded-result";
import { RECORDED_PIT_EDIT_VARIANT_ID, type RecordedPitConstraint } from "./strategy-recorded-pit-constraints";
import { RECORDED_STINT_EDIT_VARIANT_ID, type RecordedStintConstraint } from "./strategy-recorded-stint-constraints";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";
import { StrategyRecordedStintEditor } from "./StrategyRecordedStintEditor";
import { StrategyRecordedPitEditor } from "./StrategyRecordedPitEditor";
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

function CalculationStages({ state, t }: { readonly state: "idle" | "running" | "blocked"; readonly t: (key: string) => string }) {
  const current = state === "idle" ? 0 : state === "running" ? 1 : -1;
  return <ol className="strategy-recorded-plan__stages">
    {[t("strategy.workspace.sources"), t("strategy.workspace.validationPending"), t("strategy.workspace.plan")].map((label, index) => <li key={label} data-state={state === "blocked" && index > 0 ? "blocked" : index < current ? "done" : index === current ? "current" : "next"}><span>{index < current ? "✓" : index + 1}</span><strong>{label}</strong></li>)}
  </ol>;
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
    <ol className="strategy-recorded-plan__timeline" aria-label={t("strategy.workspace.plan")}>
      {plan.stints.flatMap((stint, index) => {
        const stop = plan.stopDetails[index];
        const items = [<li key={`stint:${stint.i}:${stint.lap0}`} data-kind="stint">
        <article className="strategy-recorded-plan__stint">
          <header><span>{t("strategy.plan.stint")} {index + 1}</span><strong>{draft.drivers.find(driver => driver.id === stint.d)?.name || stint.d}</strong></header>
          <dl>
            <div><dt>{t("strategy.plan.lapRange")}</dt><dd>{stint.lap0}–{stint.lap1}</dd></div>
            <div><dt>{t("strategy.plan.pace")}</dt><dd>{seconds(stint.pace)}</dd></div>
            <div><dt>{t("strategy.plan.fuel")}</dt><dd>{number(stint.fuel)} L</dd></div>
            {stint.virtualEnergy === undefined ? null : <div><dt>{t("strategy.plan.virtualEnergy")}</dt><dd>{number(stint.virtualEnergy)}%</dd></div>}
          </dl>
        </article>
      </li>];
        if (stop) items.push(<li key={`stop:${stop.index}:${stop.lap}`} data-kind="stop"><article className="strategy-recorded-plan__stop">
          <header><span>{t("strategy.plan.stop")} {index + 1}</span><strong>{t("strategy.plan.lap")} {plan.stopDetails[index].lap}</strong></header>
          <p>{t("strategy.plan.pitTime")}: {seconds(plan.stopDetails[index].pitLossSeconds)}</p>
          <p>{t("strategy.plan.fuel")}: {number(plan.stopDetails[index].fuelInLiters)} → {number(plan.stopDetails[index].fuelOutLiters)} L</p>
          {plan.stopDetails[index].virtualEnergyInPercent === undefined || plan.stopDetails[index].virtualEnergyOutPercent === undefined ? null
            : <p>{t("strategy.plan.virtualEnergy")}: {number(plan.stopDetails[index].virtualEnergyInPercent)} → {number(plan.stopDetails[index].virtualEnergyOutPercent)}%</p>}
        </article></li>);
        return items;
      })}
    </ol>
  </>;
}

export function StrategyRecordedPlan({ draft, state, acceptance, sourceLabels = {}, locked, onChange, onCalculate, onRecalculateStints, onRecalculatePits, onCancel, t }: {
  readonly draft: RecordedWizardDraft;
  readonly state: RecordedCalculationState;
  readonly acceptance: RecordedAcceptanceController;
  readonly sourceLabels?: Readonly<Record<string, string>>;
  readonly locked: boolean;
  readonly onChange: (draft: RecordedWizardDraft) => void;
  readonly onCalculate: () => void;
  readonly onRecalculateStints: (constraints: readonly RecordedStintConstraint[]) => void;
  readonly onRecalculatePits: (constraints: readonly RecordedPitConstraint[]) => void;
  readonly onCancel: () => void;
  readonly t: (key: string) => string;
}) {
  const [stintDirty, setStintDirty] = useState(false);
  const [pitDirty, setPitDirty] = useState(false);
  const [editor, setEditor] = useState<"plan" | "stints" | "pits">("plan");
  const running = state.status === "preparing" || state.status === "calculating" || state.status === "cancelling";
  const plan = currentRecordedPlan(state);
  const stintComparison = state.status === "success" && state.input.activeVariantId === RECORDED_STINT_EDIT_VARIANT_ID
    ? state.result.comparisons["recorded-main"] : undefined;
  const pitBaseId = state.status === "success" && state.input.activeVariantId === RECORDED_PIT_EDIT_VARIANT_ID
    ? state.input.variants.find(variant => variant.id !== RECORDED_PIT_EDIT_VARIANT_ID)?.id : undefined;
  const pitComparison = state.status === "success" && pitBaseId
    ? state.result.comparisons[pitBaseId] : undefined;
  const accepting = acceptance.state.status === "accepting" || acceptance.state.status === "loading";
  const calculate = () => {
    setEditor("plan");
    setStintDirty(false);
    setPitDirty(false);
    onCalculate();
  };
  const title = plan ? "strategy.calculation.ready"
    : state.status === "partial" ? "strategy.calculation.partial"
      : state.status === "error" ? "strategy.calculation.error"
        : state.status === "cancelled" ? "strategy.calculation.cancelled"
          : running ? "strategy.calculation.loading" : "strategy.workspace.notCalculated";
  const displayTitle = editor === "stints" ? "strategy.stint.title" : editor === "pits" ? "strategy.pitEdit.title" : title;
  const raceValue = draft.race.format === "laps"
    ? `${draft.race.laps ?? "—"} ${t("strategy.plan.laps").toLocaleLowerCase()}`
    : `${draft.race.durationMin ?? "—"} min`;
  const capacityParts = t("strategy.workspace.capacity").split("{{value}}");
  const editors = plan && state.status === "success" ? <nav className="strategy-recorded-plan__editors" aria-label={t("strategy.stint.eyebrow")}>
    <button type="button" aria-current={editor === "stints" ? "step" : undefined} disabled={stintDirty || pitDirty || locked || accepting} onClick={() => setEditor("stints")}><span>{t("strategy.stint.eyebrow")}</span><strong>{t("strategy.stint.title")}</strong><small>{t("strategy.stint.hint")}</small></button>
    {plan.stopDetails.length ? <button type="button" aria-current={editor === "pits" ? "step" : undefined} disabled={stintDirty || pitDirty || locked || accepting} onClick={() => setEditor("pits")}><span>{t("strategy.pitEdit.eyebrow")}</span><strong>{t("strategy.pitEdit.title")}</strong><small>{t("strategy.pitEdit.hint")}</small></button> : null}
  </nav> : null;
  const backToPlan = editor !== "plan" ? <div className="strategy-recorded-plan__editor-head"><Button variant="ghost" disabled={!!plan && (stintDirty || pitDirty || locked || accepting)} onClick={() => { setEditor("plan"); setStintDirty(false); setPitDirty(false); }}>← {t("strategy.data.tab.plan")}</Button></div> : null;
  const planWorkspace = plan && state.status === "success" ? <div className="strategy-recorded-plan__workspace">
    <div className="strategy-recorded-plan__work"><PlanResult plan={plan} draft={draft} t={t} />
      <section className="strategy-recorded-plan__sources"><h3>{t("strategy.plan.sources")}</h3><ul>{state.input.planningInputs?.projection?.sourceRevisions?.map(ref => <li key={ref.sessionId}><strong>{sourceLabels[ref.sessionId] || t("strategy.recorded.unnamed")}</strong><code>{ref.revisionId.slice(0, 12)}</code></li>)}</ul></section>
    </div>
    <aside className="strategy-recorded-plan__inspector" aria-label={t(displayTitle)}>
      <header><span>{t("strategy.data.tab.plan")}</span><h3>{t(displayTitle)}</h3></header>
      {editors}
      {backToPlan}
      {stintComparison ? <div className="strategy-recorded-plan__cost" role="status"><strong>{t("strategy.stint.cost")}</strong><span>{-stintComparison.totalDeltaSeconds >= 0 ? "+" : ""}{number(-stintComparison.totalDeltaSeconds)} s</span><small>{t("strategy.stint.costHint")}</small></div> : null}
      {pitComparison ? <div className="strategy-recorded-plan__cost" role="status"><strong>{t("strategy.pitEdit.cost")}</strong><span>{-pitComparison.totalDeltaSeconds >= 0 ? "+" : ""}{number(-pitComparison.totalDeltaSeconds)} s</span><small>{t("strategy.pitEdit.costHint")}</small></div> : null}
      {editor === "stints" ? <StrategyRecordedStintEditor key={JSON.stringify(plan.stints.map(stint => [stint.d, stint.laps]))} plan={plan} drivers={draft.drivers} locked={locked || accepting || pitDirty || state.input.activeVariantId === RECORDED_PIT_EDIT_VARIANT_ID} onDirtyChange={setStintDirty} onRecalculate={constraints => { setStintDirty(false); onRecalculateStints(constraints); }} t={t} /> : null}
      {editor === "pits" ? <StrategyRecordedPitEditor key={JSON.stringify(plan.stopDetails)} plan={plan} input={state.input} locked={locked || accepting || stintDirty} onDirtyChange={setPitDirty} onRecalculate={constraints => { setPitDirty(false); onRecalculatePits(constraints); }} t={t} /> : null}
    </aside>
  </div> : null;
  return <section className="strategy-recorded-plan" aria-labelledby="recorded-plan-title" data-editor={editor} data-status={state.status}>
    <header className="strategy-recorded-plan__heading">
      <div><p>{t("strategy.data.tab.plan")}</p><h2 id="recorded-plan-title">{t(title)}</h2></div>
      <label className="strategy-recorded-field">
        <span>{t("strategy.calculation.condition")}</span>
        <select value={draft.calculationMode ?? ""} disabled={locked || running || accepting || editor !== "plan"} onChange={event => onChange({ ...draft, calculationMode: event.target.value === "" ? undefined : event.target.value as "dry" | "wet" })}>
          <option value="">{t("strategy.journey.choose")}</option>
          <option value="dry">{t("strategy.journey.climate.dry")}</option>
          <option value="wet">{t("strategy.journey.climate.wet")}</option>
        </select>
      </label>
    </header>
    {state.status === "idle" ? <section className="strategy-recorded-plan__preflight">
      <div><p>{t("strategy.workspace.validationPending")}</p><strong>{t("strategy.workspace.calculateHint")}</strong></div>
      <dl>
        <div><dt>{t("strategy.workspace.event")}</dt><dd>{raceValue}</dd></div>
        <div><dt>{t("strategy.journey.rules.resources")}</dt><dd>{draft.tankLiters === undefined ? "—" : <>{capacityParts[0]}<span>{draft.tankLiters}{capacityParts.slice(1).join("{{value}}")}</span></>}</dd></div>
        <div><dt>{t("strategy.workspace.sources")}</dt><dd>{formatMessage(t(draft.sessions.length === 1 ? "strategy.workspace.selectedSource" : "strategy.workspace.selectedSources"), { count: draft.sessions.length })}</dd></div>
        <div><dt>{t("strategy.journey.drivers.title")}</dt><dd>{formatMessage(t(draft.drivers.length === 1 ? "strategy.workspace.driverCountOne" : "strategy.workspace.driverCount"), { count: draft.drivers.length })}<small>{draft.drivers.map(driver => driver.name).filter(Boolean).join(" · ") || "—"}</small></dd></div>
      </dl>
      <CalculationStages state="idle" t={t} />
    </section> : null}
    {running ? <div className="strategy-recorded-plan__state"><section className="strategy-recorded-plan__progress" role="status"><span aria-hidden="true" /><div><strong>{t(title)}</strong><p>{t(state.status === "preparing" ? "strategy.calculation.preparingHint" : "strategy.calculation.loadingHint")}</p></div><dl><div><dt>{t("strategy.workspace.event")}</dt><dd>{raceValue}</dd></div><div><dt>{t("strategy.workspace.sources")}</dt><dd>{draft.sessions.length}</dd></div><div><dt>{t("strategy.journey.drivers.title")}</dt><dd>{draft.drivers.length}</dd></div></dl></section><CalculationStages state="running" t={t} /></div> : null}
    {state.status === "partial" ? <div className="strategy-recorded-plan__state"><div className="strategy-recorded-plan__partial" role="status">
      <h3>{t("strategy.calculation.partialHint")}</h3>
      <dl>
        {state.coverage.paceSeconds === undefined ? null : <div><dt>{t("strategy.plan.pace")}</dt><dd>{seconds(state.coverage.paceSeconds)}</dd></div>}
        {state.coverage.fuelLitersPerLap === undefined ? null : <div><dt>{t("strategy.plan.fuelPerLap")}</dt><dd>{number(state.coverage.fuelLitersPerLap, 2)} L</dd></div>}
        {state.coverage.virtualEnergyPercentPerLap === undefined ? null : <div><dt>{t("strategy.plan.virtualEnergyPerLap")}</dt><dd>{number(state.coverage.virtualEnergyPercentPerLap, 2)}%</dd></div>}
      </dl>
      <p>{state.coverage.blockers.map(blocker => t(`strategy.calculation.blocker.${blocker}`)).join(" · ")}</p>
    </div><CalculationStages state="blocked" t={t} /></div> : null}
    {planWorkspace}
    {!plan ? backToPlan : null}
    {state.status === "cancelled" ? <div className="strategy-recorded-plan__message" role="status"><strong>{t(title)}</strong><p>{t("strategy.calculation.cancelledHint")}</p></div> : null}
    {state.status === "error" ? <div className="strategy-recorded-plan__state"><div className="strategy-recorded-plan__message strategy-recorded-plan__message--error" role="alert" data-code={state.code} data-field={state.field}><strong>{t("strategy.workspace.validationHint")}</strong><p>{t(state.code && errorKey[state.code] ? errorKey[state.code] : "strategy.calculation.errorHint")}</p></div><CalculationStages state="blocked" t={t} /></div> : null}
    {acceptance.state.status === "accepted" && !stintDirty && !pitDirty ? <p role="status">{t("strategy.plan.accepted")}</p> : null}
    {acceptance.state.status === "error" ? <p role="alert">{t("strategy.plan.acceptanceUnavailable")}</p> : null}
    {acceptance.state.status === "recovery" ? <div role="alert" className="strategy-recorded-plan__recovery"><p>{t("strategy.plan.acceptancePending")}</p><Button variant="ghost" onClick={() => void acceptance.resolve()}>{t("strategy.plan.checkAcceptance")}</Button><Button variant="ghost" onClick={() => void acceptance.retry()}>{t("strategy.plan.retryAcceptance")}</Button><Button variant="ghost" onClick={() => void acceptance.dismiss()}>{t("strategy.plan.dismissAcceptance")}</Button></div> : null}
    {editor === "plan" ? <footer className="strategy-recorded-plan__actions">
      <small>{t("strategy.plan.saveSeparate")}</small>
      {running ? <Button variant="ghost" disabled={state.status === "cancelling"} onClick={onCancel}>{t("strategy.recorded.cancel")}</Button>
        : <Button variant={state.status === "error" || state.status === "cancelled" || state.status === "partial" ? "primary" : "ghost"} disabled={locked || accepting || !draft.calculationMode} onClick={calculate}>{t(state.status === "error" || state.status === "cancelled" || state.status === "partial" ? "strategy.calculation.retry" : "strategy.workspace.calculate")}</Button>}
      {plan ? <Button variant="primary" disabled={locked || stintDirty || pitDirty || accepting || acceptance.state.status === "accepted" || acceptance.state.status === "recovery" || acceptance.state.status === "error"} onClick={() => void acceptance.accept()}>{t(accepting ? "strategy.plan.accepting" : "strategy.plan.accept")}</Button> : null}
    </footer> : null}
  </section>;
}
