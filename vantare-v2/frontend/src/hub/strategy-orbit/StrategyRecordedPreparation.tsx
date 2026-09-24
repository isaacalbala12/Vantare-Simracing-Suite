import { useState } from "react";
import { createPortal } from "react-dom";
import type { Calendar } from "../../calendar/calendar-types";
import { useOrbitSlot } from "../orbit/use-orbit-slot";
import { STRATEGY_TOPBAR_SLOT_ID } from "../components/orbit/orbit-slot-ids";
import { Icon } from "../../ui/orbit";
import { StrategyRecordedCombination } from "./StrategyRecordedCombination";
import { StrategyRecordedRules } from "./StrategyRecordedRules";
import { StrategyRecordedDrivers } from "./StrategyRecordedDrivers";
import { StrategyRecordedCircuit } from "./StrategyRecordedCircuit";
import { lmuVirtualEnergyCapability, reconcileRecordedDriverOrder, selectRecordedCalendar, selectRecordedCombination, snapshotRecordedCalendar, type RecordedCombination, type RecordedWizardDraft, type RecordedWizardStep } from "./strategy-recorded-wizard";
import { recordedWizardErrors } from "./strategy-recorded-validation";
import type { RecordedReferencesState } from "./use-recorded-references";
import "./strategy-recorded-preparation.css";

type Props = {
  readonly draft: RecordedWizardDraft; readonly onChange: (draft: RecordedWizardDraft) => void;
  readonly initialPanel?: "summary" | "combination" | "rules" | "drivers";
  readonly catalog: readonly RecordedCombination[]; readonly catalogState: "loading" | "available" | "unavailable";
  readonly calendar: Calendar | null; readonly onDiscover: () => void;
  readonly sessions: readonly { revision: { sessionId: string; baseDigest: string; revisionId: string }; candidateId: string }[];
  readonly sessionLabels: Readonly<Record<string, string>>;
  readonly onOpenDraft: () => void; readonly onExit: () => void; readonly onSave: () => void;
  readonly busy: boolean; readonly dirty: boolean; readonly canOpenDraft: boolean; readonly openDraftHint: string;
  readonly onRetryOpenDraft?: () => void; readonly error?: string; readonly t: (key: string) => string;
  readonly references?: RecordedReferencesState; readonly onRetryReferences?: () => void;
};

const formatPace = (seconds: number | undefined) => {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const milliseconds = Math.round(seconds * 1000);
  const minutes = Math.floor(milliseconds / 60_000);
  const remainder = milliseconds % 60_000;
  return `${minutes}:${String(Math.floor(remainder / 1000)).padStart(2, "0")}.${String(remainder % 1000).padStart(3, "0")}`;
};
const formatNumber = (value: number | undefined, digits: number) => value !== undefined && Number.isFinite(value) ? value.toFixed(digits) : "—";
const positive = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value > 0;
const nonNegative = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value >= 0;
type ClimateBucket = "dry" | "humid" | "wet";

/** One working draft, with the existing combination, rules and driver editors. */
export function StrategyRecordedPreparation({ draft, onChange, initialPanel = "summary", catalog, catalogState, calendar, sessions, sessionLabels, onDiscover, onOpenDraft, onExit, onSave, busy, dirty, canOpenDraft, openDraftHint, onRetryOpenDraft, references, onRetryReferences, error, t }: Props) {
  const topbarSlot = useOrbitSlot(STRATEGY_TOPBAR_SLOT_ID);
  const [inspector, setInspector] = useState<"summary" | "rules" | "drivers">(initialPanel === "rules" || initialPanel === "drivers" ? initialPanel : "summary");
  const [combinationOpen, setCombinationOpen] = useState(initialPanel === "combination");
  const [errors, setErrors] = useState<string[]>([]);
  const [chosenPreviewBucket, setChosenPreviewBucket] = useState<ClimateBucket>();
  const manual = draft.mode === "manual";
  const energyClassSupported = lmuVirtualEnergyCapability(draft.combination) !== false;
  const selectedSessions = draft.sessions.map(ref => {
    const opened = sessions.find(item => item.revision.sessionId === ref.sessionId && item.revision.baseDigest === ref.baseDigest);
    return { id: ref.sessionId, name: opened ? sessionLabels[opened.candidateId] || t("strategy.recorded.unnamed") : t("strategy.recorded.unnamed") };
  });
  const sourceName = manual ? t("strategy.entry.manualBase") : selectedSessions[0]?.name ?? t("strategy.workspace.pending");
  const pending = t("strategy.workspace.pending");
  const trackDetail = draft.combination?.trackLayout && draft.combination.trackLayout !== draft.combination.trackName
    ? draft.combination.trackLayout : draft.combination?.simId.toUpperCase() || pending;
  const raceValue = draft.race.format === "timed" ? draft.race.durationMin : draft.race.laps;
  const rulesIncomplete = raceValue === undefined || draft.tankLiters === undefined || draft.pitLossSeconds === undefined;
  const change = (next: RecordedWizardDraft) => { setErrors([]); onChange(next); };
  const open = () => {
    const invalid = [...new Set(["combination", "rules", "drivers", "sessions"].flatMap(step => recordedWizardErrors(draft, step as RecordedWizardStep)))];
    setErrors(invalid);
    if (invalid.length === 0 && canOpenDraft) onOpenDraft();
  };
  const planning = references?.status === "ready" ? references.planning : undefined;
  const projection = planning?.projection;
  const paceBuckets = projection?.representativePaceByClimateBucket;
  const firstAvailableBucket = (["dry", "humid", "wet"] as const).find(bucket => {
    const family = paceBuckets?.[bucket];
    return family?.presence === "valid" && positive(family.medianLapSeconds);
  });
  const previewBucket = chosenPreviewBucket ?? draft.calculationMode ?? firstAvailableBucket ?? "dry";
  const paceOverride = planning?.overrides.base_pace_seconds;
  const fuelOverride = planning?.overrides.fuel_per_lap_liters;
  const energyOverride = planning?.overrides.ve_per_lap_percent;
  const paceAdjusted = paceOverride?.presence === "valid";
  const fuelAdjusted = fuelOverride?.presence === "valid";
  const energyAdjusted = energyOverride?.presence === "valid";
  const observedPace = paceBuckets?.[previewBucket];
  const paceUncertain = !paceAdjusted && observedPace?.presence === "unknown" && (observedPace.confidence?.sampleSize ?? 0) > 0 && positive(observedPace.medianLapSeconds);
  const paceValue = paceAdjusted ? positive(paceOverride.value) ? paceOverride.value : undefined
    : (observedPace?.presence === "valid" || paceUncertain) && positive(observedPace?.medianLapSeconds) ? observedPace.medianLapSeconds : undefined;
  const fuelFamily = projection?.fuelConsumption;
  const energyFamily = projection?.virtualEnergyConsumption;
  const observedFuel = fuelFamily?.byClimateBucket ? fuelFamily.byClimateBucket[previewBucket] : fuelFamily?.meanPerLap;
  const observedEnergy = energyFamily?.byClimateBucket ? energyFamily.byClimateBucket[previewBucket] : energyFamily?.meanPerLap;
  const fuelUncertain = !fuelAdjusted && fuelFamily?.presence === "unknown" && (fuelFamily.confidence?.sampleSize ?? 0) > 0 && positive(observedFuel);
  const energyUncertain = !energyAdjusted && energyFamily?.presence === "unknown" && (energyFamily.confidence?.sampleSize ?? 0) > 0 && nonNegative(observedEnergy);
  const fuelValue = fuelAdjusted ? positive(fuelOverride.value) ? fuelOverride.value : undefined
    : (fuelFamily?.presence === "valid" || fuelUncertain) && positive(observedFuel) ? observedFuel : undefined;
  const energyValue = energyAdjusted ? nonNegative(energyOverride.value) ? energyOverride.value : undefined
    : (energyFamily?.presence === "valid" || energyUncertain) && nonNegative(observedEnergy) ? observedEnergy : undefined;
  const evidence = (kind?: "manual" | "reference") => t(kind === "manual" ? "strategy.entry.referenceManual" : kind === "reference" ? "strategy.entry.referenceAdjusted" : "strategy.entry.referenceObserved");
  const observedScope = (hasBuckets: boolean) => t(hasBuckets ? `strategy.journey.climate.${previewBucket}` : "strategy.entry.referenceSessionMean");
  const missing = (presence?: string, bucketed = false, reason?: string) => t(manual || references?.status !== "ready" ? "strategy.entry.referencePending"
    : reason === "no_completed_laps_for_representative_pace" ? "strategy.entry.referenceNoCompleteLaps"
      : presence === "unknown" ? "strategy.entry.referenceUncertain"
    : presence === "invalid" || presence === "stale" || presence === "unsupported" ? "strategy.entry.referenceInvalid"
      : bucketed && (presence === "valid" || presence === undefined) ? "strategy.entry.referenceBucketMissing" : "strategy.entry.referenceMissing");
  const cards = [
    { icon: "i-carreras" as const, title: t("strategy.entry.referencePace"), value: manual ? formatPace(positive(draft.manualInputs?.paceSeconds) ? draft.manualInputs?.paceSeconds : undefined) : formatPace(paceValue), unit: t("strategy.entry.paceUnit"), detail: manual ? t("strategy.entry.estimated") : `${evidence(paceAdjusted ? paceOverride.provenance.kind : undefined)}${paceAdjusted ? "" : ` · ${t(`strategy.journey.climate.${previewBucket}`)}`}`, missing: missing(paceAdjusted ? "invalid" : observedPace?.presence, !paceAdjusted && Boolean(paceBuckets), observedPace?.reason), uncertain: paceUncertain },
    { icon: "i-telemetria" as const, title: t("strategy.entry.referenceFuel"), value: manual ? formatNumber(positive(draft.manualInputs?.fuelLitersPerLap) ? draft.manualInputs?.fuelLitersPerLap : undefined, 2) : formatNumber(fuelValue, 2), unit: t("strategy.entry.fuelUnit"), detail: manual ? t("strategy.entry.estimated") : `${evidence(fuelAdjusted ? fuelOverride.provenance.kind : undefined)}${fuelAdjusted ? "" : ` · ${observedScope(Boolean(fuelFamily?.byClimateBucket))}`}`, missing: missing(fuelAdjusted ? "invalid" : fuelFamily?.presence, !fuelAdjusted && Boolean(fuelFamily?.byClimateBucket)), uncertain: fuelUncertain },
    ...(energyClassSupported && (draft.virtualEnergy?.applicability === "applicable" || (!manual && nonNegative(energyValue))) ? [{ icon: "i-ajustes" as const, title: t("strategy.entry.referenceEnergy"), value: manual ? formatNumber(nonNegative(draft.manualInputs?.virtualEnergyPercentPerLap) ? draft.manualInputs?.virtualEnergyPercentPerLap : undefined, 1) : formatNumber(energyValue, 1), unit: t("strategy.entry.energyUnit"), detail: manual ? t("strategy.entry.estimated") : `${evidence(energyAdjusted ? energyOverride.provenance.kind : undefined)}${energyAdjusted ? "" : ` · ${observedScope(Boolean(energyFamily?.byClimateBucket))}`}${draft.virtualEnergy?.applicability !== "applicable" ? ` · ${t(draft.virtualEnergy?.applicability === "not_applicable" ? "strategy.entry.referenceRuleNotApplicable" : "strategy.entry.referenceRulePending")}` : ""}`, missing: missing(energyAdjusted ? "invalid" : energyFamily?.presence, !energyAdjusted && Boolean(energyFamily?.byClimateBucket)), uncertain: energyUncertain }] : []),
  ];

  const navigation = <div className="strategy-preparation__navigation"><span>{t("strategy.entry.preparation")}{draft.combination ? ` · ${draft.combination.trackName}` : ""}</span><button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy} onClick={onExit}>{t("strategy.entry.changeSource")}</button></div>;
  return <>{topbarSlot ? createPortal(navigation, topbarSlot) : null}<section className="strategy-preparation" aria-label={t("strategy.entry.preparation")}>
    {!topbarSlot ? navigation : null}
    <div className="strategy-preparation__workspace">
      <div className="strategy-preparation__board">
      <aside className="strategy-preparation__context" aria-label={t("strategy.entry.circuitAndSource")}>
        <header><strong>{t("strategy.entry.circuitAndSource")}</strong><Icon name="i-carreras" size={17} /></header>
        <div className="strategy-preparation__circuit"><span className="strategy-preparation__micro">{t("strategy.journey.track")}</span><b>{draft.combination?.trackName || pending}</b><small>{trackDetail}</small><StrategyRecordedCircuit combination={draft.combination} t={t} /></div>
        <div className="strategy-preparation__car"><span className="strategy-preparation__micro">{draft.combination?.carClass || t("strategy.journey.car")}</span><b>{draft.combination?.carName || pending}</b><button type="button" className="strategy-preparation__text-action" disabled={busy} aria-expanded={combinationOpen} aria-controls="strategy-preparation-combination" onClick={() => setCombinationOpen(value => !value)}>{t("strategy.entry.changeCombination")} ↗</button></div>
        {combinationOpen ? <div id="strategy-preparation-combination" className="strategy-preparation__combination-panel"><fieldset disabled={busy}><StrategyRecordedCombination draft={draft} catalog={catalog} catalogState={catalogState} calendar={calendar} onDiscover={onDiscover} t={t}
          onCombination={id => change(selectRecordedCombination(draft, id, catalog))}
          onCalendar={id => change(selectRecordedCalendar(draft, id && calendar ? snapshotRecordedCalendar(calendar, id, "lmu", new Date().toISOString()) : undefined, catalog))} /></fieldset></div> : null}
        <div className="strategy-preparation__source"><span className="strategy-preparation__micro">{t("strategy.entry.baseTitle")}</span><strong>{sourceName}</strong><p>{manual ? t("strategy.entry.estimatedHint") : selectedSessions.length ? t("strategy.recorded.originals") : t("strategy.entry.telemetryHint")}</p></div>
        <footer>{manual ? t("strategy.entry.estimated") : t("strategy.recorded.originals")}</footer>
      </aside>
      <main className="strategy-preparation__main">
        <section className="strategy-preparation__entry" aria-label={t("strategy.entry.baseTitle")}><header><h3>{t("strategy.entry.baseTitle")}</h3><span>{manual ? t("strategy.journey.manual") : t("strategy.entry.telemetryBase")}</span></header>
          <div className="strategy-preparation__entry-body"><div><span className="strategy-preparation__micro">{manual ? t("strategy.entry.fromReferences") : selectedSessions.length ? t("strategy.entry.selectedSession") : t("strategy.entry.fromLaps")}</span><h4>{manual ? t("strategy.entry.ownPaceRace") : t("strategy.entry.fromLapsRace")}</h4><p>{manual ? t("strategy.entry.manualDescription") : selectedSessions.length ? t("strategy.entry.selectedBaseDescription") : t("strategy.entry.telemetryHint")}</p><div className="strategy-preparation__entry-actions"><button type="button" className="orbit-btn orbit-btn--ghost" disabled={busy} onClick={manual ? () => setCombinationOpen(true) : onDiscover}>{manual ? t("strategy.entry.changeCombination") : selectedSessions.length ? t("strategy.entry.changeSession") : t("strategy.entry.openTelemetry")}</button><span>{manual ? t("strategy.entry.noTelemetry") : t("strategy.recorded.originals")}</span></div></div><div className="strategy-preparation__document" aria-hidden="true"><Icon name={manual ? "i-ajustes" : "i-telemetria"} size={36} /><b>{manual ? t("strategy.journey.manual") : "LMU"}</b><small>{manual ? (energyClassSupported ? "PACE / FUEL / VE" : "PACE / FUEL") : "DUCKDB"}</small></div></div>
          <footer>{manual ? t("strategy.entry.estimatedHint") : selectedSessions.length ? t("strategy.entry.baseSelected") : t("strategy.entry.telemetryHint")}</footer></section>
        {manual ? <section className="strategy-preparation__manual-inputs" aria-label={t("strategy.entry.ownReferences")}><header><h3>{t("strategy.entry.ownReferences")}</h3><span>{t("strategy.entry.estimated")}</span></header><fieldset disabled={busy}><div>{(["paceSeconds", "fuelLitersPerLap", "virtualEnergyPercentPerLap"] as const).filter(field => field !== "virtualEnergyPercentPerLap" || (energyClassSupported && draft.virtualEnergy?.applicability === "applicable")).map(field => <label key={field}><span>{t(`strategy.entry.input.${field}`)}</span><input type="number" inputMode="decimal" min={field === "virtualEnergyPercentPerLap" ? 0 : 0.001} step="any" value={draft.manualInputs?.[field] ?? ""} onChange={event => change({ ...draft, manualInputs: { ...draft.manualInputs, [field]: event.target.value === "" ? undefined : Number(event.target.value) } })} /></label>)}</div></fieldset><p>{t("strategy.entry.estimatedHint")}</p></section>
          : <section className="strategy-preparation__source-list" aria-label={t("strategy.entry.sessionReferences")}><header><h3>{t("strategy.entry.sessionReferences")}</h3><button type="button" disabled={busy} onClick={onDiscover}>{t("strategy.workspace.review")} ↗</button></header>{selectedSessions.length ? <ul>{selectedSessions.map(item => <li key={item.id}><Icon name="i-telemetria" size={18} /><strong>{item.name}</strong><small>{t("strategy.entry.baseSelected")}</small></li>)}</ul> : <p>{t("strategy.workspace.noSources")}</p>}<footer>{t("strategy.recorded.originals")}</footer></section>}
        <section className="strategy-preparation__references" aria-label={t("strategy.entry.referenceTitle")}><header><h3>{t("strategy.entry.referenceTitle")}</h3><span>{manual ? t("strategy.entry.estimated") : references?.status === "ready" ? t("strategy.entry.referenceRevision") : t("strategy.entry.referencePending")}</span></header>
          {!manual && references?.status === "ready" ? <label className="strategy-preparation__preview-bucket">{t("strategy.entry.previewClimate")}<select value={previewBucket} onChange={event => setChosenPreviewBucket(event.currentTarget.value as ClimateBucket)}>{(["dry", "humid", "wet"] as const).map(bucket => <option key={bucket} value={bucket}>{t(`strategy.journey.climate.${bucket}`)}</option>)}</select></label> : null}
          {!manual && references?.status === "open_sources" ? <p className="strategy-preparation__reference-message">{t("strategy.entry.referenceOpenSources")} <button type="button" disabled={busy} onClick={onDiscover}>{t("strategy.entry.openTelemetry")}</button></p> : null}
          {!manual && references?.status === "no_sources" ? <p className="strategy-preparation__reference-message">{t("strategy.entry.referenceNoSources")} <button type="button" disabled={busy} onClick={onDiscover}>{t("strategy.entry.openTelemetry")}</button></p> : null}
          {!manual && references?.status === "no_combination" ? <p className="strategy-preparation__reference-message">{t("strategy.entry.referenceNoCombination")}</p> : null}
          {!manual && references?.status === "repository_unavailable" ? <p className="strategy-preparation__reference-message">{t("strategy.workspace.repositoryUnavailable")} {onRetryOpenDraft ? <button type="button" disabled={busy} onClick={onRetryOpenDraft}>{t("strategy.workspace.refresh")}</button> : null}</p> : null}
          {!manual && references?.status === "loading" ? <p className="strategy-preparation__reference-message" role="status">{t("strategy.workspace.loading")}</p> : null}
          {!manual && references?.status === "error" ? <p className="strategy-preparation__reference-message" role="alert">{t("strategy.entry.referenceUnavailable")} {onRetryReferences ? <button type="button" disabled={busy} onClick={onRetryReferences}>{t("strategy.workspace.refresh")}</button> : null}</p> : null}
          <div>{cards.map(item => <article key={item.title} data-quality={item.uncertain ? "uncertain" : undefined}><header><Icon name={item.icon} size={15} /><b>{item.title}</b></header><strong>{item.value}</strong><small>{item.uncertain ? <><b>{t("strategy.entry.referenceUncertain")}</b><span>{item.unit} · {item.detail}</span></> : item.value === "—" ? item.missing : `${item.unit} · ${item.detail}`}</small></article>)}</div></section>
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
