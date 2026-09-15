import { useState, type ReactNode } from "react";
import type { Calendar } from "../../calendar/calendar-types";
import type { AnalysisClient } from "../../strategy/analysis-client";
import type { StrategyApplicationClient } from "../../strategy/strategy-application-client";
import { ConfirmDialog, Drawer, Button } from "../../ui/orbit";
import { useHubSuspendBlocker } from "../hub-suspend-guard";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import type { StoredRecordedDraft } from "./strategy-recorded-persistence";
import type { RecordedCombination, RecordedWizardDraft, RecordedWizardStep } from "./strategy-recorded-wizard";
import { useRecordedWorkflow } from "./use-recorded-workflow";
import type { RecordedSession } from "./strategy-recorded-session";
import { StrategyRecordedWizard } from "./StrategyRecordedWizard";
import { StrategyRecordedOverview } from "./StrategyRecordedOverview";
import { StrategyRecordedSessionsView } from "./StrategyRecordedSessions";
import { StrategyRecordedData, type RecordedDataView } from "./StrategyRecordedData";
import { StrategyRecordedRevisions } from "./StrategyRecordedRevisions";
import { StrategyRecordedPlan } from "./StrategyRecordedPlan";
import { useRecordedCalculation } from "./use-recorded-calculation";
import { useRecordedAcceptance } from "./use-recorded-acceptance";

/** Mount once per event. Views never own or dispose the opened Analysis files. */
export function StrategyRecordedWorkflow({ eventId, repositoryVersion, repositoryLoading = false, onRetryRepository, initial, catalog, catalogState, calendar, application, analysis, onExit, onCleanupError, navigation, t }: {
  readonly eventId: string; readonly repositoryVersion?: number; readonly initial?: StoredRecordedDraft;
  readonly repositoryLoading?: boolean; readonly onRetryRepository?: () => void;
  readonly catalog: readonly RecordedCombination[]; readonly catalogState: "loading" | "available" | "unavailable";
  readonly calendar: Calendar | null; readonly application: StrategyApplicationClient<RecordedDraftPayload>;
  readonly analysis?: AnalysisClient; readonly onExit: () => void; readonly onCleanupError: () => void; readonly t: (key: string) => string;
  readonly navigation?: (state: { requestExit: () => void; draft: RecordedWizardDraft; view: "preparation" | "editor"; busy: boolean }) => ReactNode;
}) {
  const flow = useRecordedWorkflow({ eventId, repositoryVersion, initial, catalog, application, analysis, onCleanupError });
  const calculation = useRecordedCalculation(flow.draft, repositoryVersion, application);
  const [planVisited, setPlanVisited] = useState(false);
  const acceptance = useRecordedAcceptance(eventId, flow.draft, calculation.state, application, planVisited);
  const [dataPending, setDataPending] = useState(false);
  const [historyPending, setHistoryPending] = useState(false);
  const formPending = dataPending || historyPending;
  const [tab, setTab] = useState<"race" | "data" | "plan" | "revisions">("race");
  // The selected Data subview survives Data remounts on revision changes;
  // forms stay local to Data and still reset with its revision key.
  const [dataView, setDataView] = useState<RecordedDataView>("laps");
  const [dataVisited, setDataVisited] = useState(false);
  const [historyVisited, setHistoryVisited] = useState(false);
  const calculationBusy = calculation.state.status === "preparing" || calculation.state.status === "calculating" || calculation.state.status === "cancelling";
  const acceptanceBusy = acceptance.state.status === "loading" || acceptance.state.status === "accepting" || acceptance.state.status === "recovery";
  const strategyBusy = calculationBusy || acceptanceBusy;
  useHubSuspendBlocker(`strategy-recorded:${eventId}`, t("strategy.workspace.unsaved"), flow.dirty || flow.busy || formPending || strategyBusy);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const discover = () => { setLibraryOpen(true); void flow.sessions.discover(); };
  const edit = (step: RecordedWizardStep) => { if (formPending || strategyBusy) return; flow.change({ ...flow.draft, step }); flow.prepare(); };
  const exit = () => { if (flow.busy || strategyBusy) return; if (flow.dirty || formPending) setExitOpen(true); else onExit(); };
  const error = flow.error || flow.proposalError ? t("strategy.workspace.operationFailed") : undefined;
  const sessionLabels = Object.fromEntries((flow.sessions.candidates ?? []).filter(item => item.displayName).map(item => [item.id, item.displayName!]));
  const revisionKey = `${flow.sessions.corrections.editor?.session.opened.sessionId ?? "none"}:${flow.sessions.corrections.editor?.current.revision.revisionId ?? "none"}`;
  // Inspection navigates only on acceptance, never on load success: a failed
  // read keeps an empty editor with its cause instead of previous data.
  const inspectSession = (session: RecordedSession) => {
    if (formPending || strategyBusy) return;
    if (flow.inspect(session)) { setLibraryOpen(false); setDataVisited(true); setTab("data"); }
  };
  // Back to the wizard never recreates the draft nor saves: forms and the
  // uncertain command keep blocking any exit from the editor.
  const backToPreparation = () => {
    if (flow.busy || formPending || strategyBusy || flow.sessions.corrections.unresolved) return;
    flow.prepare();
  };
  const backBlocked = flow.busy || formPending || strategyBusy || flow.sessions.corrections.unresolved;
  const sourceView = <StrategyRecordedSessionsView controller={{ ...flow.sessions, busy: flow.busy, locked: flow.sessions.locked || formPending || strategyBusy }} onInspect={inspectSession} t={t} />;
  return <div className="strategy-recorded-workflow" data-view={flow.view} data-tab={tab}>
    {navigation?.({ requestExit: exit, draft: flow.draft, view: flow.view, busy: flow.busy || strategyBusy })}
    {flow.view === "preparation" ? <StrategyRecordedWizard draft={flow.draft} onChange={flow.change} catalog={flow.choices} catalogState={flow.choices.length > 0 ? "available" : catalogState} calendar={calendar}
      canOpenDraft={!flow.busy && (flow.stored !== undefined || repositoryVersion !== undefined)}
      openDraftHint={t(flow.sessions.busy ? "strategy.recorded.busy" : repositoryLoading ? "strategy.workspace.repositoryLoading" : "strategy.workspace.repositoryUnavailable")}
      onRetryOpenDraft={!flow.busy && !repositoryLoading ? onRetryRepository : undefined}
      onDiscover={discover} sessions={sourceView} onOpenDraft={() => void flow.openEditor()} onExit={exit} busy={flow.saving} error={error} t={t} />
      : <>
        <Button variant="ghost" disabled={backBlocked} onClick={backToPreparation}>{t("strategy.recorded.backToWizard")}</Button>
        <nav className="strategy-recorded-tabs" role="tablist" aria-label={t("strategy.data.editorTabs")}>{(["race", "data", "plan", "revisions"] as const).map((item, index, tabs) => <button key={item} id={`recorded-tab-${item}`} type="button" role="tab" aria-selected={tab === item} aria-controls={`recorded-panel-${item}`} tabIndex={tab === item ? 0 : -1} onClick={() => { setTab(item); if (item === "data") setDataVisited(true); if (item === "plan") setPlanVisited(true); if (item === "revisions") setHistoryVisited(true); }} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined;
          if (next === undefined) return;
          event.preventDefault(); setTab(tabs[next]); if (tabs[next] === "data") setDataVisited(true); if (tabs[next] === "plan") setPlanVisited(true); if (tabs[next] === "revisions") setHistoryVisited(true);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
        }}>{t(`strategy.data.tab.${item}`)}</button>)}</nav>
        <div className="strategy-recorded-editor-panel" id="recorded-panel-race" role="tabpanel" aria-labelledby="recorded-tab-race" hidden={tab !== "race"}><StrategyRecordedOverview draft={flow.draft} dirty={flow.dirty} busy={flow.busy || formPending || strategyBusy} error={error} onEdit={edit} onSources={() => setLibraryOpen(true)} onSave={() => void flow.save()} t={t} /></div>
        {dataVisited ? <div className="strategy-recorded-editor-panel" id="recorded-panel-data" role="tabpanel" aria-labelledby="recorded-tab-data" hidden={tab !== "data"}><StrategyRecordedData key={revisionKey} controller={flow.sessions.corrections} sessionLabels={sessionLabels} sessions={flow.sessions.sessions} selectedRevisions={flow.draft.sessions} catalog={catalog} busy={flow.busy || historyPending || strategyBusy} onSources={() => setLibraryOpen(true)} onPendingChange={setDataPending} view={dataView} onViewChange={setDataView} t={t} /></div> : null}
        <div className="strategy-recorded-editor-panel" id="recorded-panel-plan" role="tabpanel" aria-labelledby="recorded-tab-plan" hidden={tab !== "plan"}><StrategyRecordedPlan draft={flow.draft} state={calculation.state} acceptance={acceptance} locked={flow.busy || formPending || repositoryVersion === undefined} onChange={flow.change} onCalculate={() => void calculation.calculate()} onRecalculateStints={constraints => void calculation.recalculateStints(constraints)} onRecalculatePits={constraints => void calculation.recalculatePits(constraints)} onCancel={calculation.cancel} t={t} /></div>
        {historyVisited ? <div className="strategy-recorded-editor-panel" id="recorded-panel-revisions" role="tabpanel" aria-labelledby="recorded-tab-revisions" hidden={tab !== "revisions"}><StrategyRecordedRevisions key={revisionKey} controller={flow.sessions.corrections} sessions={flow.sessions.sessions} selectedRevisions={flow.draft.sessions} sessionLabels={sessionLabels} busy={flow.busy || dataPending || strategyBusy} configurationSaved={Boolean(flow.stored)} configurationDirty={flow.dirty} onSources={() => setLibraryOpen(true)} onPendingChange={setHistoryPending} t={t} /></div> : null}
      </>}
    <Drawer open={libraryOpen} title={t("strategy.recorded.title")} closeLabel={t("strategy.recorded.close")} onClose={() => setLibraryOpen(false)}>{sourceView}</Drawer>
    <ConfirmDialog open={exitOpen} title={t("strategy.workspace.leaveTitle")} body={t("strategy.workspace.leaveBody")} confirmLabel={t("strategy.workspace.leave")} cancelLabel={t("strategy.recorded.cancel")} onCancel={() => setExitOpen(false)} onConfirm={onExit} />
  </div>;
}
