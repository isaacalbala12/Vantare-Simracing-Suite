import { useState } from "react";
import { createPortal } from "react-dom";
import type { Calendar } from "../../calendar/calendar-types";
import { useOrbitSlot } from "../orbit/use-orbit-slot";
import { STRATEGY_TOPBAR_SLOT_ID } from "../components/orbit/orbit-slot-ids";
import { Icon } from "../../ui/orbit";
import { StrategyRecordedCombination } from "./StrategyRecordedCombination";
import { StrategyRecordedRules } from "./StrategyRecordedRules";
import { StrategyRecordedDrivers } from "./StrategyRecordedDrivers";
import { reconcileRecordedDriverOrder, selectRecordedCalendar, selectRecordedCombination, snapshotRecordedCalendar, type RecordedCombination, type RecordedWizardDraft, type RecordedWizardStep } from "./strategy-recorded-wizard";
import { recordedWizardErrors } from "./strategy-recorded-validation";
import "./strategy-recorded-preparation.css";

type Props = {
  readonly draft: RecordedWizardDraft; readonly onChange: (draft: RecordedWizardDraft) => void;
  readonly catalog: readonly RecordedCombination[]; readonly catalogState: "loading" | "available" | "unavailable";
  readonly calendar: Calendar | null; readonly onDiscover: () => void;
  readonly sessions: readonly { revision: { sessionId: string; revisionId: string }; candidateId: string }[];
  readonly sessionLabels: Readonly<Record<string, string>>;
  readonly onOpenDraft: () => void; readonly onExit: () => void; readonly onSave: () => void;
  readonly busy: boolean; readonly dirty: boolean; readonly canOpenDraft: boolean; readonly openDraftHint: string;
  readonly onRetryOpenDraft?: () => void; readonly error?: string; readonly t: (key: string) => string;
};

const formatPace = (seconds: number | undefined) => {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const milliseconds = Math.round(seconds * 1000);
  const minutes = Math.floor(milliseconds / 60_000);
  const remainder = milliseconds % 60_000;
  return `${minutes}:${String(Math.floor(remainder / 1000)).padStart(2, "0")}.${String(remainder % 1000).padStart(3, "0")}`;
};
const formatNumber = (value: number | undefined, digits: number) => value !== undefined && Number.isFinite(value) ? value.toFixed(digits) : "—";

/** One working draft, with the existing combination, rules and driver editors. */
export function StrategyRecordedPreparation({ draft, onChange, catalog, catalogState, calendar, sessions, sessionLabels, onDiscover, onOpenDraft, onExit, onSave, busy, dirty, canOpenDraft, openDraftHint, onRetryOpenDraft, error, t }: Props) {
  const topbarSlot = useOrbitSlot(STRATEGY_TOPBAR_SLOT_ID);
  const [inspector, setInspector] = useState<"summary" | "rules" | "drivers">("summary");
  const [combinationOpen, setCombinationOpen] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const manual = draft.mode === "manual";
  const selectedSessions = draft.sessions.map(ref => {
    const opened = sessions.find(item => item.revision.sessionId === ref.sessionId && item.revision.revisionId === ref.revisionId);
    return { id: ref.sessionId, name: opened ? sessionLabels[opened.candidateId] || t("strategy.recorded.unnamed") : t("strategy.recorded.unnamed") };
  });
  const sourceName = manual ? t("strategy.entry.manualBase") : selectedSessions[0]?.name ?? t("strategy.workspace.pending");
  const pending = t("strategy.workspace.pending");
  const raceValue = draft.race.format === "timed" ? draft.race.durationMin : draft.race.laps;
  const rulesIncomplete = raceValue === undefined || draft.tankLiters === undefined || draft.pitLossSeconds === undefined;
  const change = (next: RecordedWizardDraft) => { setErrors([]); onChange(next); };
  const open = () => {
    const invalid = [...new Set(["combination", "rules", "drivers", "sessions"].flatMap(step => recordedWizardErrors(draft, step as RecordedWizardStep)))];
    setErrors(invalid);
    if (invalid.length === 0 && canOpenDraft) onOpenDraft();
  };
  // The selected revision has no read-only projection in this view. Never
  // substitute values from a newly opened handle or an illustrative session.
  const references = [
    { icon: "i-carreras" as const, title: t("strategy.entry.referencePace"), value: manual ? formatPace(draft.manualInputs?.paceSeconds) : "—", unit: t("strategy.entry.paceUnit") },
    { icon: "i-telemetria" as const, title: t("strategy.entry.referenceFuel"), value: manual ? formatNumber(draft.manualInputs?.fuelLitersPerLap, 2) : "—", unit: t("strategy.entry.fuelUnit") },
    ...(draft.virtualEnergy?.applicability === "applicable" ? [{ icon: "i-ajustes" as const, title: t("strategy.entry.referenceEnergy"), value: manual ? formatNumber(draft.manualInputs?.virtualEnergyPercentPerLap, 1) : "—", unit: t("strategy.entry.energyUnit") }] : []),
  ];

  const navigation = <div className="strategy-preparation__navigation"><span>{t("strategy.entry.preparation")}{draft.combination ? ` · ${draft.combination.trackName}` : ""}</span><button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy} onClick={onExit}>{t("strategy.entry.changeSource")}</button></div>;
  return <>{topbarSlot ? createPortal(navigation, topbarSlot) : null}<section className="strategy-preparation" aria-label={t("strategy.entry.preparation")}>
    {!topbarSlot ? navigation : null}
    <div className="strategy-preparation__workspace">
      <div className="strategy-preparation__board">
      <aside className="strategy-preparation__context" aria-label={t("strategy.entry.circuitAndSource")}>
        <header><strong>{t("strategy.entry.circuitAndSource")}</strong><Icon name="i-carreras" size={17} /></header>
        <div className="strategy-preparation__circuit"><span className="strategy-preparation__micro">{t("strategy.journey.track")}</span><b>{draft.combination?.trackName || pending}</b><small>{draft.combination?.trackLayout || "Le Mans Ultimate"}</small></div>
        <div className="strategy-preparation__car"><span className="strategy-preparation__micro">{draft.combination?.carClass || t("strategy.journey.car")}</span><b>{draft.combination?.carName || pending}</b><button type="button" className="strategy-preparation__text-action" disabled={busy} aria-expanded={combinationOpen} aria-controls="strategy-preparation-combination" onClick={() => setCombinationOpen(value => !value)}>{t("strategy.entry.changeCombination")} ↗</button></div>
        {combinationOpen ? <div id="strategy-preparation-combination" className="strategy-preparation__combination-panel"><fieldset disabled={busy}><StrategyRecordedCombination draft={draft} catalog={catalog} catalogState={catalogState} calendar={calendar} onDiscover={onDiscover} t={t}
          onCombination={id => change(selectRecordedCombination(draft, id, catalog))}
          onCalendar={id => change(selectRecordedCalendar(draft, id && calendar ? snapshotRecordedCalendar(calendar, id, "lmu", new Date().toISOString()) : undefined, catalog))} /></fieldset></div> : null}
        <div className="strategy-preparation__source"><span className="strategy-preparation__micro">{t("strategy.entry.baseTitle")}</span><strong>{sourceName}</strong><p>{manual ? t("strategy.entry.estimatedHint") : selectedSessions.length ? t("strategy.recorded.originals") : t("strategy.entry.telemetryHint")}</p></div>
        <footer>{manual ? t("strategy.entry.estimated") : t("strategy.recorded.originals")}</footer>
      </aside>
      <main className="strategy-preparation__main">
        <section className="strategy-preparation__entry" aria-label={t("strategy.entry.baseTitle")}><header><h3>{t("strategy.entry.baseTitle")}</h3><span>{manual ? t("strategy.journey.manual") : t("strategy.entry.telemetryBase")}</span></header>
          <div className="strategy-preparation__entry-body"><div><span className="strategy-preparation__micro">{manual ? t("strategy.entry.fromReferences") : selectedSessions.length ? t("strategy.entry.selectedSession") : t("strategy.entry.fromLaps")}</span><h4>{manual ? t("strategy.entry.ownPaceRace") : t("strategy.entry.fromLapsRace")}</h4><p>{manual ? t("strategy.entry.manualDescription") : selectedSessions.length ? t("strategy.entry.selectedBaseDescription") : t("strategy.entry.telemetryHint")}</p><div className="strategy-preparation__entry-actions"><button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy} onClick={manual ? () => setCombinationOpen(true) : onDiscover}>{manual ? t("strategy.entry.changeCombination") : selectedSessions.length ? t("strategy.entry.changeSession") : t("strategy.entry.openTelemetry")}</button><span>{manual ? t("strategy.entry.noTelemetry") : t("strategy.recorded.originals")}</span></div></div><div className="strategy-preparation__document" aria-hidden="true"><Icon name={manual ? "i-ajustes" : "i-telemetria"} size={36} /><b>{manual ? t("strategy.journey.manual") : "LMU"}</b><small>{manual ? "PACE / FUEL / VE" : "DUCKDB"}</small></div></div>
          <footer>{manual ? t("strategy.entry.estimatedHint") : selectedSessions.length ? t("strategy.entry.baseSelected") : t("strategy.entry.telemetryHint")}</footer></section>
        {manual ? <section className="strategy-preparation__manual-inputs" aria-label={t("strategy.entry.ownReferences")}><header><h3>{t("strategy.entry.ownReferences")}</h3><span>{t("strategy.entry.estimated")}</span></header><fieldset disabled={busy}><div>{(["paceSeconds", "fuelLitersPerLap", "virtualEnergyPercentPerLap"] as const).filter(field => field !== "virtualEnergyPercentPerLap" || draft.virtualEnergy?.applicability === "applicable").map(field => <label key={field}><span>{t(`strategy.entry.input.${field}`)}</span><input type="number" inputMode="decimal" min={field === "virtualEnergyPercentPerLap" ? 0 : 0.001} step="any" value={draft.manualInputs?.[field] ?? ""} onChange={event => change({ ...draft, manualInputs: { ...draft.manualInputs, [field]: event.target.value === "" ? undefined : Number(event.target.value) } })} /></label>)}</div></fieldset><p>{t("strategy.entry.estimatedHint")}</p></section>
          : <section className="strategy-preparation__source-list" aria-label={t("strategy.entry.sessionReferences")}><header><h3>{t("strategy.entry.sessionReferences")}</h3><button type="button" disabled={busy} onClick={onDiscover}>{t("strategy.workspace.review")} ↗</button></header>{selectedSessions.length ? <ul>{selectedSessions.map(item => <li key={item.id}><Icon name="i-telemetria" size={18} /><strong>{item.name}</strong><small>{t("strategy.entry.baseSelected")}</small></li>)}</ul> : <p>{t("strategy.workspace.noSources")}</p>}<footer>{t("strategy.recorded.originals")}</footer></section>}
        <section className="strategy-preparation__references" aria-label={t("strategy.entry.referenceTitle")}><header><h3>{t("strategy.entry.referenceTitle")}</h3><span>{manual ? t("strategy.entry.estimated") : t("strategy.entry.referencePending")}</span></header><div>{references.map(item => <article key={item.title}><header><Icon name={item.icon} size={15} /><b>{item.title}</b></header><strong>{item.value}</strong><small>{item.value === "—" ? t("strategy.entry.referencePending") : item.unit}</small></article>)}</div></section>
      </main>
      </div>
      <aside className="strategy-preparation__inspector" aria-label={t("strategy.entry.settings")}><header><span className="strategy-preparation__micro">{t("strategy.entry.preparation")}</span><h3>{inspector === "summary" ? t("strategy.entry.yourRace") : t(`strategy.entry.panel.${inspector}`)}</h3><p>{t("strategy.entry.summaryHint")}</p></header><nav aria-label={t("strategy.entry.settings")}>{(["summary", "drivers", "rules"] as const).map(item => <button key={item} type="button" aria-pressed={inspector === item} onClick={() => setInspector(item)}>{t(`strategy.entry.panel.${item}`)}</button>)}</nav><div className="strategy-preparation__inspector-body">
        {inspector === "summary" ? <div className="strategy-preparation__summary"><section><span className="strategy-preparation__micro">{draft.calendar ? t("strategy.journey.calendar") : t("strategy.journey.custom")}</span><h4>{draft.name || draft.calendar?.series.name || pending}</h4><div className="strategy-preparation__duration"><strong>{raceValue ?? "—"}</strong><span>{t(draft.race.format === "timed" ? "strategy.journey.minutes" : "strategy.journey.laps")}</span>{draft.calculationMode ? <small>{t(`strategy.journey.climate.${draft.calculationMode}`)}</small> : null}</div><button type="button" disabled={busy} className={`strategy-preparation__text-action${rulesIncomplete ? " strategy-preparation__text-action--primary" : ""}`} onClick={() => setInspector("rules")}>{t("strategy.entry.editRules")} ↗</button></section><section><h4>{t("strategy.entry.conditions")}</h4><dl><div><dt>{t("strategy.journey.pit.min")}</dt><dd>{draft.rules?.minPitStops ?? pending}</dd></div><div><dt>{t("strategy.journey.pit.loss")}</dt><dd>{draft.pitLossSeconds ?? pending}</dd></div><div><dt>{t("strategy.journey.fuel.capacity")}</dt><dd>{draft.tankLiters ?? pending}</dd></div></dl></section><section><div className="strategy-preparation__section-head"><h4>{t("strategy.entry.panel.drivers")}</h4><button type="button" disabled={busy} className="strategy-preparation__text-action" onClick={() => setInspector("drivers")}>{t("strategy.workspace.edit")} ↗</button></div>{draft.drivers.length ? draft.drivers.map((driver, index) => <button type="button" disabled={busy} className="strategy-preparation__driver" key={driver.id} onClick={() => setInspector("drivers")}><span>{String(index + 1).padStart(2, "0")}</span><b>{driver.name || pending}</b><small>{driver.paceDeltaSeconds === undefined ? pending : `${driver.paceDeltaSeconds > 0 ? "+" : ""}${driver.paceDeltaSeconds} s`}</small></button>) : <p>{pending}</p>}</section></div> : null}
        {inspector === "rules" ? <fieldset disabled={busy}><StrategyRecordedRules draft={draft} onChange={change} t={t} /></fieldset> : null}
        {inspector === "drivers" ? <fieldset disabled={busy}><StrategyRecordedDrivers draft={draft} onChange={change} onAdd={() => { const drivers = [...draft.drivers, { id: globalThis.crypto.randomUUID(), name: "" }]; change({ ...draft, drivers, driverOrder: reconcileRecordedDriverOrder(draft, drivers) }); }} t={t} /></fieldset> : null}
      </div><footer><p role="status">{t(busy ? "strategy.workspace.saving" : dirty ? "strategy.workspace.unsaved" : "strategy.workspace.saved")}</p><div><button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy || !dirty} onClick={onSave}>{t("strategy.workspace.save")}</button><button type="button" className="orbit-btn orbit-btn--primary" disabled={busy || !canOpenDraft} onClick={open}>{t("strategy.entry.openRace")} ↗</button></div>{!canOpenDraft ? <p role="status">{openDraftHint} {onRetryOpenDraft ? <button type="button" onClick={onRetryOpenDraft}>{t("strategy.workspace.refresh")}</button> : null}</p> : null}{errors.length ? <div role="alert">{errors.map(code => <p key={code}>{t(`strategy.journey.error.${code}`)}</p>)}</div> : null}{error ? <p role="alert">{error}</p> : null}</footer></aside>
    </div>
  </section></>;
}
