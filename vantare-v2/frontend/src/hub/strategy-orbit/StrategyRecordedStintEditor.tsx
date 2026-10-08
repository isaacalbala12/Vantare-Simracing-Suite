import { useState } from "react";
import type { StrategyOrbitCalculatedPlanV1 } from "../../strategy/strategy-application-client";
import { Button } from "../../ui/orbit";
import type { RecordedStintConstraint } from "./strategy-recorded-stint-constraints";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";

type EditableStint = { readonly driverId: string; readonly laps: number };

function pace(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function decimal(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

export function StrategyRecordedStintEditor({ plan, drivers, locked, onDirtyChange, onRecalculate, t }: {
  readonly plan: StrategyOrbitCalculatedPlanV1;
  readonly drivers: RecordedWizardDraft["drivers"];
  readonly locked: boolean;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onRecalculate: (constraints: readonly RecordedStintConstraint[]) => void;
  readonly t: (key: string) => string;
}) {
  const baseline = plan.stints.map(stint => ({ driverId: stint.d, laps: stint.laps }));
  const [stints, setStints] = useState<readonly EditableStint[]>(baseline);
  const [active, setActive] = useState(0);
  const dirty = stints.some((stint, index) => stint.driverId !== baseline[index].driverId || stint.laps !== baseline[index].laps);

  const update = (next: readonly EditableStint[]) => {
    setStints(next);
    onDirtyChange(next.some((stint, index) => stint.driverId !== baseline[index].driverId || stint.laps !== baseline[index].laps));
  };
  const moveBoundary = (index: number, value: number) => {
    const current = stints.slice();
    const oldBoundary = current.slice(0, index + 1).reduce((sum, stint) => sum + stint.laps, 0);
    const delta = value - oldBoundary;
    if (!Number.isSafeInteger(value) || current[index].laps + delta < 1 || current[index + 1].laps - delta < 1) return;
    current[index] = { ...current[index], laps: current[index].laps + delta };
    current[index + 1] = { ...current[index + 1], laps: current[index + 1].laps - delta };
    update(current);
  };

  const selectedPlan = plan.stints[active];
  return <section className="strategy-recorded-stint-editor" aria-label={t("strategy.stint.title")}>
    <div className="strategy-recorded-stint-editor__context"><strong>{t("strategy.stint.total")}</strong><span>{plan.totalLaps} {t("strategy.stint.laps")}</span><p>{t("strategy.stint.hint")}</p></div>
    <label className="strategy-recorded-editor__select"><span>{t("strategy.stint.title")}</span><select value={active} onChange={event => setActive(Number(event.target.value))}>{stints.map((_, index) => <option key={index} value={index}>{t("strategy.plan.stint")} {index + 1}</option>)}</select></label>
    <nav className="strategy-recorded-stint-editor__selector" aria-label={t("strategy.stint.title")}>
      {stints.map((_, index) => <button key={index} type="button" aria-current={active === index ? "step" : undefined} onClick={() => setActive(index)}><span>{index + 1}</span>{t("strategy.plan.stint")} {index + 1}</button>)}
    </nav>
    {selectedPlan ? <dl className="strategy-recorded-stint-editor__facts">
      <div><dt>{t("strategy.plan.lapRange")}</dt><dd>{selectedPlan.laps}</dd></div>
      <div><dt>{t("strategy.plan.pace")}</dt><dd>{selectedPlan.pace ? pace(selectedPlan.pace) : "—"}</dd></div>
      <div><dt>{t("strategy.plan.fuel")}</dt><dd>{selectedPlan.fuel === undefined ? "—" : `${decimal(selectedPlan.fuel)} L`}</dd></div>
      <div><dt>{t("strategy.plan.virtualEnergy")}</dt><dd>{selectedPlan.virtualEnergy === undefined ? "—" : `${decimal(selectedPlan.virtualEnergy)}%`}</dd></div>
    </dl> : null}
    <ol>
      {stints.map((stint, index) => {
        const boundary = stints.slice(0, index + 1).reduce((sum, item) => sum + item.laps, 0);
        const min = boundary - stint.laps + 1;
        const max = index < stints.length - 1 ? boundary + stints[index + 1].laps - 1 : boundary;
        return <li key={index} hidden={index !== active}>
          <article>
            <strong>{t("strategy.plan.stint")} {index + 1}</strong>
            <label><span>{t("strategy.stint.driver")}</span><select value={stint.driverId} disabled={locked} onChange={event => update(stints.map((item, itemIndex) => itemIndex === index ? { ...item, driverId: event.target.value } : item))}>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>
            <span>{stint.laps} {t("strategy.stint.laps")}</span>
          </article>
          {index < stints.length - 1 ? <div className="strategy-recorded-stint-editor__boundary">
            <label><span>{t("strategy.stint.boundary")}</span><input aria-label={`${t("strategy.stint.dragBoundary")} ${index + 1}`} type="range" min={min} max={max} value={boundary} disabled={locked} onChange={event => moveBoundary(index, Number(event.target.value))} /></label>
            <label><span>{t("strategy.plan.lap")}</span><input aria-label={`${t("strategy.stint.numberBoundary")} ${index + 1}`} type="number" min={min} max={max} value={boundary} disabled={locked} onChange={event => moveBoundary(index, Number(event.target.value))} /></label>
          </div> : null}
        </li>;
      })}
    </ol>
    <footer>
      {dirty ? <p role="status">{t("strategy.stint.stale")}</p> : null}
      <Button variant="ghost" disabled={locked || !dirty} onClick={() => update(baseline)}>{t("strategy.stint.reset")}</Button>
      <Button variant="primary" disabled={locked || !dirty} onClick={() => onRecalculate(stints.map((stint, index) => ({ index, ...stint })))}>{t("strategy.stint.recalculate")}</Button>
    </footer>
  </section>;
}
