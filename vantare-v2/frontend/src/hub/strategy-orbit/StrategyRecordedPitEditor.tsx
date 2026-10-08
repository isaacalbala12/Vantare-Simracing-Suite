import { useState } from "react";
import type { StrategyOrbitCalculatedPlanV1, StrategyOrbitCalculationInputV1 } from "../../strategy/strategy-application-client";
import type { StrategyCompound } from "../../strategy/strategy-tyre";
import { Button } from "../../ui/orbit";
import type { RecordedPitConstraint } from "./strategy-recorded-pit-constraints";

type EditablePit = {
  readonly fuelLiters: number;
  readonly vePercent?: number;
  readonly changeTyres?: boolean;
  readonly compound?: StrategyCompound;
};

function same(left: EditablePit, right: EditablePit): boolean {
  return left.fuelLiters === right.fuelLiters
    && left.vePercent === right.vePercent
    && left.changeTyres === right.changeTyres
    && left.compound === right.compound;
}

function seconds(value: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} s`;
}

function editableNumber(value: number): number {
  return Math.round(value * 10) / 10;
}

export function StrategyRecordedPitEditor({ plan, input, locked, onDirtyChange, onRecalculate, t }: {
  readonly plan: StrategyOrbitCalculatedPlanV1;
  readonly input: StrategyOrbitCalculationInputV1;
  readonly locked: boolean;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onRecalculate: (constraints: readonly RecordedPitConstraint[]) => void;
  readonly t: (key: string) => string;
}) {
  const tyreInventory = input.event.tyreInventory;
  const compounds = tyreInventory
    ? [...new Set(tyreInventory.tyres.map(tyre => tyre.compound))]
    : [];
  const baseline = plan.stopDetails.map((stop, index): EditablePit => ({
    fuelLiters: editableNumber(stop.fuelOutLiters - stop.fuelInLiters),
    ...(stop.virtualEnergyInPercent === undefined || stop.virtualEnergyOutPercent === undefined
      ? {} : { vePercent: editableNumber(stop.virtualEnergyOutPercent - stop.virtualEnergyInPercent) }),
    ...(tyreInventory ? {
      changeTyres: stop.changeTyres ?? false,
      compound: (stop.changeTyres ?? false)
        ? stop.compound ?? plan.stints[index + 1]?.compound ?? compounds[0]
        : plan.stints[index + 1]?.compound,
    } : {}),
  }));
  const [pits, setPits] = useState<readonly EditablePit[]>(baseline);
  const [active, setActive] = useState(0);
  const dirty = pits.some((pit, index) => !same(pit, baseline[index]));

  const update = (next: readonly EditablePit[]) => {
    setPits(next);
    onDirtyChange(next.some((pit, index) => !same(pit, baseline[index])));
  };
  const updateNumber = (index: number, field: "fuelLiters" | "vePercent", value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    update(pits.map((pit, pitIndex) => pitIndex === index ? { ...pit, [field]: value } : pit));
  };

  return <section className="strategy-recorded-pit-editor" aria-label={t("strategy.pitEdit.title")}>
    <div className="strategy-recorded-pit-editor__context"><strong>{t("strategy.pitEdit.total")}</strong><span>{plan.stopDetails.length}</span><p>{t(input.event.pitServices?.serviceMode === "sequential" ? "strategy.pitEdit.sequential"
      : input.event.pitServices?.serviceMode === "parallel" ? "strategy.pitEdit.parallel" : "strategy.pitEdit.modeUnavailable")}</p></div>
    <label className="strategy-recorded-editor__select"><span>{t("strategy.pitEdit.title")}</span><select value={active} onChange={event => setActive(Number(event.target.value))}>{pits.map((_, index) => <option key={index} value={index}>{t("strategy.plan.stop")} {index + 1}</option>)}</select></label>
    <nav className="strategy-recorded-pit-editor__selector" aria-label={t("strategy.pitEdit.title")}>
      {pits.map((_, index) => <button key={index} type="button" aria-current={active === index ? "step" : undefined} onClick={() => setActive(index)}><span>{index + 1}</span>{t("strategy.plan.stop")} {index + 1}</button>)}
    </nav>
    <ol>
      {pits.map((pit, index) => {
        const stop = plan.stopDetails[index];
        const nextCompound = plan.stints[index + 1]?.compound;
        return <li key={stop.index} hidden={index !== active}>
          <article>
            <header><strong>{t("strategy.plan.stop")} {index + 1}</strong><span>{t("strategy.plan.lap")} {stop.lap}</span></header>
            <div className="strategy-recorded-pit-editor__fields">
              <label><span>{t("strategy.pitEdit.fuelAdded")}</span><span className="strategy-recorded-pit-editor__input"><input aria-label={`${t("strategy.pitEdit.fuelAdded")} ${index + 1}`} type="number" min="0" step="0.1" value={pit.fuelLiters} disabled={locked} onChange={event => updateNumber(index, "fuelLiters", Number(event.target.value))} /> L</span></label>
              {pit.vePercent === undefined ? null : <label><span>{t("strategy.pitEdit.veAdded")}</span><span className="strategy-recorded-pit-editor__input"><input aria-label={`${t("strategy.pitEdit.veAdded")} ${index + 1}`} type="number" min="0" step="0.1" value={pit.vePercent} disabled={locked} onChange={event => updateNumber(index, "vePercent", Number(event.target.value))} /> %</span></label>}
              {tyreInventory && compounds.length ? <>
                <label className="strategy-recorded-pit-editor__check"><input aria-label={`${t("strategy.pitEdit.changeTyres")} ${index + 1}`} type="checkbox" checked={pit.changeTyres ?? false} disabled={locked} onChange={event => update(pits.map((item, pitIndex) => pitIndex === index ? {
                  ...item, changeTyres: event.target.checked,
                  compound: event.target.checked ? item.compound ?? nextCompound ?? compounds[0] : nextCompound,
                } : item))} /><span>{t("strategy.pitEdit.changeTyres")}</span></label>
                <label><span>{t("strategy.pitEdit.compound")}</span><select aria-label={`${t("strategy.pitEdit.compound")} ${index + 1}`} value={pit.compound ?? ""} disabled={locked || !pit.changeTyres} onChange={event => update(pits.map((item, pitIndex) => pitIndex === index ? { ...item, compound: event.target.value as StrategyCompound } : item))}>{compounds.map(compound => <option key={compound} value={compound}>{t(`strategy.journey.compound.${compound}`)}</option>)}</select></label>
              </> : null}
            </div>
            {tyreInventory && compounds.length ? null : <p className="strategy-recorded-pit-editor__unavailable">{t("strategy.pitEdit.tyresUnavailable")}</p>}
            {stop.pitBreakdownAvailable ? <dl>
              <div><dt>{t("strategy.pitEdit.transit")}</dt><dd>{seconds(stop.pitTransitSeconds)}</dd></div>
              <div><dt>{t("strategy.pitEdit.service")}</dt><dd>{seconds(stop.pitServiceSeconds)}</dd></div>
              <div><dt>{t("strategy.pitEdit.overlap")}</dt><dd>−{seconds(stop.pitOverlapSeconds)}</dd></div>
              <div><dt>{t("strategy.pitEdit.total")}</dt><dd>{seconds(stop.pitLossSeconds)}</dd></div>
            </dl> : <p className="strategy-recorded-pit-editor__unavailable">{t("strategy.pitEdit.breakdownUnavailable")}</p>}
          </article>
        </li>;
      })}
    </ol>
    <footer>
      {dirty ? <p role="status">{t("strategy.pitEdit.stale")}</p> : null}
      <Button variant="ghost" disabled={locked || !dirty} onClick={() => update(baseline)}>{t("strategy.pitEdit.reset")}</Button>
      <Button variant="primary" disabled={locked || !dirty} onClick={() => onRecalculate(pits.map((pit, index) => ({ index, ...pit })))}>{t("strategy.pitEdit.recalculate")}</Button>
    </footer>
  </section>;
}
