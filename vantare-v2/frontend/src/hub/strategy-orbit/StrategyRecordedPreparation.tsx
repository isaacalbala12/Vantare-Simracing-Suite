import { useRef, useState } from "react";
import type { Calendar } from "../../calendar/calendar-types";
import { StrategyRecordedCombination } from "./StrategyRecordedCombination";
import { StrategyRecordedRules } from "./StrategyRecordedRules";
import { StrategyRecordedDrivers } from "./StrategyRecordedDrivers";
import { StrategyRecordedOverview } from "./StrategyRecordedOverview";
import { reconcileRecordedDriverOrder, selectRecordedCalendar, selectRecordedCombination, snapshotRecordedCalendar, type RecordedCombination, type RecordedWizardDraft, type RecordedWizardStep } from "./strategy-recorded-wizard";
import { recordedWizardErrors } from "./strategy-recorded-validation";
import "./strategy-recorded-preparation.css";

export function StrategyRecordedPreparation({ draft, onChange, catalog, catalogState, calendar, sessions, sessionLabels, onDiscover, onSources, onOpenDraft, onExit, onSave, busy, dirty, canOpenDraft, openDraftHint, onRetryOpenDraft, error, t }: {
  readonly draft: RecordedWizardDraft; readonly onChange: (draft: RecordedWizardDraft) => void;
  readonly catalog: readonly RecordedCombination[]; readonly catalogState: "loading" | "available" | "unavailable";
  readonly calendar: Calendar | null; readonly onDiscover: () => void; readonly onSources: () => void;
  readonly sessions: readonly { revision: { sessionId: string }; candidateId: string }[]; readonly sessionLabels: Readonly<Record<string, string>>;
  readonly onOpenDraft: () => void; readonly onExit: () => void; readonly onSave: () => void;
  readonly busy: boolean; readonly dirty: boolean; readonly canOpenDraft: boolean; readonly openDraftHint: string;
  readonly onRetryOpenDraft?: () => void; readonly error?: string; readonly t: (key: string) => string;
}) {
  const [inspector, setInspector] = useState<"summary" | "rules" | "drivers">("summary");
  const combination = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const change = (next: RecordedWizardDraft) => { setErrors([]); onChange(next); };
  const open = () => {
    const invalid = [...new Set(["combination", "rules", "drivers", "sessions"].flatMap(step => recordedWizardErrors(draft, step as RecordedWizardStep)))];
    setErrors(invalid);
    if (invalid.length === 0 && canOpenDraft) onOpenDraft();
  };
  return <section className="strategy-preparation" aria-labelledby="strategy-preparation-title">
    <header className="strategy-preparation__head"><div><span className="strategy-preparation__micro">{t("strategy.entry.preparation")}</span><h2 id="strategy-preparation-title">{draft.combination?.trackName || t("strategy.entry.prepareTitle")}</h2><p>{draft.combination?.carName || t("strategy.entry.prepareDescription")}</p></div><button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy} onClick={onExit}>{t("strategy.journey.back")}</button></header>
    <div className="strategy-preparation__workspace">
      <aside className="strategy-preparation__context" aria-label={t("strategy.entry.circuitAndSource")}><header><b>{t("strategy.entry.circuitAndSource")}</b><span>{draft.mode === "manual" ? t("strategy.journey.manual") : t("strategy.entry.telemetry")}</span></header>
        <div className="strategy-preparation__circuit-art" aria-hidden="true"><span>{draft.combination?.trackName || "LMU"}</span></div>
        <div ref={combination} tabIndex={-1}><fieldset disabled={busy}>
        <StrategyRecordedCombination draft={draft} catalog={catalog} catalogState={catalogState} calendar={calendar} onDiscover={onDiscover} t={t}
          onCombination={id => change(selectRecordedCombination(draft, id, catalog))}
          onCalendar={id => change(selectRecordedCalendar(draft, id && calendar ? snapshotRecordedCalendar(calendar, id, "lmu", new Date().toISOString()) : undefined, catalog))} />
        </fieldset></div>
      </aside>
      <main className="strategy-preparation__main"><div className="strategy-preparation__origin"><div><span className="strategy-preparation__micro">{t("strategy.entry.source")}</span><h3>{draft.mode === "manual" ? t("strategy.entry.manualBase") : t("strategy.entry.telemetryBase")}</h3><p>{draft.mode === "manual" ? t("strategy.entry.manualDescription") : t("strategy.entry.telemetryHint")}</p></div><button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy} onClick={onSources}>{t("strategy.entry.changeSource")}</button></div>
        {draft.mode === "manual" ? <section className="strategy-preparation__manual-inputs" aria-label={t("strategy.entry.manualBase")}><header><h3>{t("strategy.entry.manualBase")}</h3><span>{t("strategy.entry.estimated")}</span></header><fieldset disabled={busy}><div>{(["paceSeconds", "fuelLitersPerLap", "virtualEnergyPercentPerLap"] as const).filter(field => field !== "virtualEnergyPercentPerLap" || draft.virtualEnergy?.applicability === "applicable").map(field => <label key={field}><span>{t(`strategy.entry.input.${field}`)}</span><input type="number" inputMode="decimal" min={field === "virtualEnergyPercentPerLap" ? 0 : 0.001} step="any" value={draft.manualInputs?.[field] ?? ""} onChange={event => change({ ...draft, manualInputs: { ...draft.manualInputs, [field]: event.target.value === "" ? undefined : Number(event.target.value) } })} /></label>)}</div></fieldset><p>{t("strategy.entry.estimatedHint")}</p></section> : null}
        {draft.mode === "automatic" ? <section className="strategy-preparation__source-list" aria-label={t("strategy.workspace.sources")}><header><h3>{t("strategy.workspace.sources")}</h3><button type="button" onClick={onDiscover}>{t("strategy.entry.openTelemetry")} ↗</button></header>{draft.sessions.length ? <ul>{draft.sessions.map(ref => { const session = sessions.find(item => item.revision.sessionId === ref.sessionId); return <li key={ref.sessionId}><strong>{session ? sessionLabels[session.candidateId] || t("strategy.recorded.unnamed") : t("strategy.recorded.unnamed")}</strong><small>{t("strategy.history.pinned")}</small></li>; })}</ul> : <p>{t("strategy.workspace.noSources")}</p>}</section> : null}
        <StrategyRecordedOverview draft={draft} dirty={dirty} busy={busy} error={error} hidePlan onEdit={step => { if (step === "combination") combination.current?.focus(); else setInspector(step === "drivers" ? "drivers" : "rules"); }} onSources={onDiscover} onSave={onSave} t={t} />
      </main>
      <aside className="strategy-preparation__inspector" aria-label={t("strategy.entry.settings")}><header><span className="strategy-preparation__micro">{t("strategy.entry.preparation")}</span><h3>{t("strategy.entry.yourRace")}</h3></header><nav aria-label={t("strategy.entry.settings")}>{(["summary", "rules", "drivers"] as const).map(item => <button key={item} type="button" aria-pressed={inspector === item} onClick={() => setInspector(item)}>{t(`strategy.entry.panel.${item}`)}</button>)}</nav><div className="strategy-preparation__inspector-body">
        {inspector === "summary" ? <div className="strategy-preparation__summary"><p>{t("strategy.entry.summaryHint")}</p><dl><div><dt>{t("strategy.journey.track")}</dt><dd>{draft.combination?.trackName || t("strategy.workspace.pending")}</dd></div><div><dt>{t("strategy.journey.car")}</dt><dd>{draft.combination?.carName || t("strategy.workspace.pending")}</dd></div><div><dt>{t("strategy.journey.step.drivers")}</dt><dd>{draft.drivers.map(item => item.name).filter(Boolean).join(" · ") || t("strategy.workspace.pending")}</dd></div></dl><button type="button" className="orbit-btn orbit-btn--ghost" onClick={() => setInspector("rules")}>{t("strategy.entry.editRules")}</button></div> : null}
        {inspector === "rules" ? <fieldset disabled={busy}><StrategyRecordedRules draft={draft} onChange={change} t={t} /></fieldset> : null}
        {inspector === "drivers" ? <fieldset disabled={busy}><StrategyRecordedDrivers draft={draft} onChange={change} onAdd={() => { const drivers = [...draft.drivers, { id: globalThis.crypto.randomUUID(), name: "" }]; change({ ...draft, drivers, driverOrder: reconcileRecordedDriverOrder(draft, drivers) }); }} t={t} /></fieldset> : null}
      </div><footer><button type="button" className="orbit-btn orbit-btn--primary" disabled={busy || !canOpenDraft} onClick={open}>{t("strategy.entry.openRace")} ↗</button>{!canOpenDraft ? <p role="status">{openDraftHint} {onRetryOpenDraft ? <button type="button" onClick={onRetryOpenDraft}>{t("strategy.workspace.refresh")}</button> : null}</p> : null}{errors.length ? <div role="alert">{errors.map(code => <p key={code}>{t(`strategy.journey.error.${code}`)}</p>)}</div> : null}{error ? <p role="alert">{error}</p> : null}</footer></aside>
    </div>
  </section>;
}
