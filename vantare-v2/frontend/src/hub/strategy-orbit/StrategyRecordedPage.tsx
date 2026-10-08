import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { Button, Icon, useToast } from "../../ui/orbit";
import type { AnalysisClient } from "../../strategy/analysis-client";
import type { StrategyApplicationClient, StrategyPlanSummaryV1 } from "../../strategy/strategy-application-client";
import { useCalendarStarts } from "../orbit/use-calendar-starts";
import { useOrbitSlot } from "../orbit/use-orbit-slot";
import { createStrategyOrbitApplicationClient } from "./strategy-orbit-bridge";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import type { StoredRecordedDraft } from "./strategy-recorded-persistence";
import type { RecordedWizardDraft } from "./strategy-recorded-wizard";
import { loadStrategySessionCatalog, type StrategySessionCatalogView } from "./strategy-session-selection";
import { useRecordedLibrary } from "./use-recorded-library";
import { StrategyRecordedWorkflow } from "./StrategyRecordedWorkflow";
import { StrategyPlanHistory } from "./StrategyPlanHistory";
import "./strategy-recorded-page.css";

export const STRATEGY_CONTEXT_SLOT_ID = "orbit-strategy-context-slot";

function RecordedContext({ active, draft, onNew, onLibrary, disabled, t }: {
  readonly active: boolean; readonly draft?: RecordedWizardDraft; readonly disabled: boolean; readonly onNew: () => void; readonly onLibrary: () => void; readonly t: (key: string) => string;
}) {
  return <nav className="strategy-recorded-context" aria-label={t("strategy.tabs.label")}>
    <span className="strategy-recorded-context__label">{t("strategy.home.title")}</span>
    <button type="button" disabled={disabled} aria-current={active ? "page" : undefined} onClick={onNew}>{t("strategy.home.new")}</button>
    <button type="button" disabled={disabled} aria-current={!active ? "page" : undefined} onClick={onLibrary}>{t("strategy.home.saved")}</button>
    {draft ? <section className="strategy-recorded-context__identity" aria-label={t("strategy.workspace.yourRace")}>
      <h3>{t("strategy.workspace.yourRace")}</h3>
      <div><Icon name="i-launcher" size={24} /><p><small>{t("strategy.journey.simulator")}</small><strong>{draft.combination?.simId === "lmu" ? "Le Mans Ultimate" : draft.combination?.simId ?? t("strategy.workspace.pending")}</strong></p></div>
      <div><Icon name="i-estrategia" size={24} /><p><small>{t("strategy.journey.car")}</small><strong>{draft.combination?.carName ?? t("strategy.workspace.pending")}</strong></p></div>
      <div><Icon name="i-carreras" size={24} /><p><small>{t("strategy.journey.track")}</small><strong>{draft.combination?.trackName ?? t("strategy.workspace.pending")}</strong></p></div>
    </section> : null}
  </nav>;
}

/** Recorded-only entry. No legacy event store, live subscription or UI-side solver. */
export function StrategyRecordedPage({ applicationClient: supplied, analysisClient }: {
  readonly applicationClient?: StrategyApplicationClient<RecordedDraftPayload>; readonly analysisClient?: AnalysisClient;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const slot = useOrbitSlot(STRATEGY_CONTEXT_SLOT_ID);
  const calendar = useCalendarStarts();
  const [application] = useState(() => supplied ?? createStrategyOrbitApplicationClient<RecordedDraftPayload>());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; queueMicrotask(() => { if (!supplied && !mounted.current) application.dispose(); }); };
  }, [application, supplied]);
  const library = useRecordedLibrary(application);
  const [historyPlan, setHistoryPlan] = useState<StrategyPlanSummaryV1>();
  const [active, setActive] = useState<{ eventId: string; initial?: StoredRecordedDraft } | null>(() => ({ eventId: globalThis.crypto.randomUUID() }));
  const [catalog, setCatalog] = useState<StrategySessionCatalogView>();
  const [catalogState, setCatalogState] = useState<"loading" | "available" | "unavailable">("loading");
  const [catalogRetry, setCatalogRetry] = useState(0);
  const destination = useRef<"new" | "library">("library");
  useEffect(() => {
    let current = true;
    void loadStrategySessionCatalog(application).then(view => { if (current) { setCatalog(view); setCatalogState("available"); } }, () => { if (current) setCatalogState("unavailable"); });
    return () => { current = false; };
  }, [application, catalogRetry]);
  const exit = () => {
    setHistoryPlan(undefined);
    setActive(destination.current === "new" ? { eventId: globalThis.crypto.randomUUID() } : null);
    library.refresh(); setCatalogState("loading"); setCatalogRetry(value => value + 1);
  };
  const openSavedDraft = (draftId: string) => {
    setHistoryPlan(undefined);
    setActive(null);
    void library.open(draftId).then(opened => {
      if (opened) setActive({ eventId: opened.document.payload.eventId, initial: opened });
    });
  };
  const openSavedPlan = (plan: StrategyPlanSummaryV1) => { setActive(null); setHistoryPlan(plan); };
  return <div className="orbit-strategy orbit-strategy--recorded strategy-recorded-page" data-testid="orbit-strategy">
    {active ? <StrategyRecordedWorkflow key={active.eventId} eventId={active.eventId} initial={active.initial} repositoryVersion={library.repositoryVersion}
      repositoryLoading={library.status === "loading"} onRetryRepository={library.refresh}
      catalog={catalog?.combinations ?? []} catalogState={catalogState} calendar={calendar.calendar} application={application} analysis={analysisClient}
      onExit={exit} onRequestSaved={() => { destination.current = "library"; }} onOpenSavedDraft={openSavedDraft} onOpenSavedPlan={openSavedPlan}
      saved={{ status: library.status, opening: library.opening, drafts: library.plans, plans: library.savedPlans, error: library.error, recoveredFromBackup: library.recoveredFromBackup, onRetry: library.refresh }}
      onCleanupError={() => toast.show(t("strategy.recorded.error"), t("strategy.workspace.cleanupFailed"))} t={t}
      navigation={({ requestExit, draft, busy }) => slot ? createPortal(<RecordedContext active disabled={busy} draft={draft} t={t} onNew={() => requestExit(() => { destination.current = "new"; exit(); })} onLibrary={() => requestExit(() => { destination.current = "library"; exit(); })} />, slot) : null} />
      : historyPlan ? <>
        {slot ? createPortal(<RecordedContext active={false} disabled={false} t={t} onNew={() => { destination.current = "new"; exit(); }} onLibrary={() => { setHistoryPlan(undefined); library.refresh(); }} />, slot) : null}
        <StrategyPlanHistory key={`${historyPlan.planId}:${historyPlan.variantId}`} plan={historyPlan} application={application} onClose={() => setHistoryPlan(undefined)} t={t} />
      </> : <section className="strategy-recorded-library" aria-labelledby="recorded-library-title">
        {slot ? createPortal(<RecordedContext active={false} disabled={library.opening} t={t} onNew={() => { destination.current = "new"; exit(); }} onLibrary={library.refresh} />, slot) : null}
        <header><h2 id="recorded-library-title">{t("strategy.home.saved")}</h2><p>{t("strategy.workspace.libraryHint")}</p></header>
        <div className="strategy-recorded-library__tools"><label>{t("strategy.workspace.search")}<input type="search" value={library.query} onChange={event => library.setQuery(event.currentTarget.value)} /></label>
          <Button variant="ghost" disabled={library.opening || library.status === "loading"} onClick={library.refresh}>{t("strategy.workspace.refresh")}</Button>
          <Button disabled={library.opening} onClick={() => { setHistoryPlan(undefined); setActive({ eventId: globalThis.crypto.randomUUID() }); }}>{t("strategy.home.new")}</Button></div>
        {library.status === "loading" ? <p role="status">{t("strategy.workspace.loading")}</p> : null}
        {library.opening ? <p role="status">{t("strategy.journey.opening")}</p> : null}
        {library.error ? <p role="alert">{t("strategy.workspace.libraryError")}</p> : null}
        {library.recoveredFromBackup ? <p role="status">{t("strategy.workspace.recovered")}</p> : null}
        {library.status === "ready" && library.plans.length === 0 && library.savedPlans.length === 0 ? <p>{t("strategy.workspace.emptyLibrary")}</p> : null}
        <div className="strategy-recorded-library__boards">
          <section className="strategy-recorded-library__drafts" aria-labelledby="recorded-drafts-title"><h3 id="recorded-drafts-title">{t("strategy.entry.savedDrafts")}</h3>
            <ul>{library.plans.map(plan => <li key={plan.draftId}><div><strong>{plan.name}</strong><small>{new Date(plan.updatedAt).toLocaleString()}</small></div>
              <Button variant="ghost" disabled={library.opening || library.status !== "ready"} onClick={() => { if (plan.draftId) openSavedDraft(plan.draftId); }}>{t("strategy.workspace.open")}</Button></li>)}</ul>
          </section>
          <section className="strategy-recorded-library__history" aria-labelledby="recorded-history-title"><h3 id="recorded-history-title">{t("strategy.planHistory.savedPlans")}</h3>
            <ul>{library.savedPlans.map(plan => <li key={`${plan.planId}:${plan.variantId}`}><div><strong>{plan.name}</strong><small>{plan.revisionCount} {t("strategy.planHistory.revisions")}</small></div>
              <Button variant="ghost" disabled={library.opening || library.status !== "ready"} onClick={() => openSavedPlan(plan)}>{t("strategy.planHistory.open")}</Button></li>)}</ul>
          </section>
        </div>
      </section>}
  </div>;
}
