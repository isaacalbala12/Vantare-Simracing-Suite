import { useState, type ReactNode } from "react";
import type { Calendar } from "../../calendar/calendar-types";
import type { AnalysisClient } from "../../strategy/analysis-client";
import type { StrategyApplicationClient } from "../../strategy/strategy-application-client";
import { ConfirmDialog, Drawer } from "../../ui/orbit";
import { useHubSuspendBlocker } from "../hub-suspend-guard";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import type { StoredRecordedDraft } from "./strategy-recorded-persistence";
import type { RecordedCombination, RecordedWizardDraft, RecordedWizardStep } from "./strategy-recorded-wizard";
import { useRecordedWorkflow } from "./use-recorded-workflow";
import { StrategyRecordedWizard } from "./StrategyRecordedWizard";
import { StrategyRecordedOverview } from "./StrategyRecordedOverview";
import { StrategyRecordedSessionsView } from "./StrategyRecordedSessions";
import { StrategyRecordedData } from "./StrategyRecordedData";

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
  const [formPending, setFormPending] = useState(false);
  const [tab, setTab] = useState<"race" | "data" | "plan" | "revisions">("race");
  const [dataVisited, setDataVisited] = useState(false);
  useHubSuspendBlocker(`strategy-recorded:${eventId}`, t("strategy.workspace.unsaved"), flow.dirty || flow.busy || formPending);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const discover = () => { setLibraryOpen(true); void flow.sessions.discover(); };
  const edit = (step: RecordedWizardStep) => { if (formPending) return; flow.change({ ...flow.draft, step }); flow.prepare(); };
  const exit = () => { if (flow.busy) return; if (flow.dirty || formPending) setExitOpen(true); else onExit(); };
  const error = flow.error || flow.proposalError ? t("strategy.workspace.operationFailed") : undefined;
  const sourceView = <StrategyRecordedSessionsView controller={flow.sessions} t={t} />;
  return <div className="strategy-recorded-workflow" data-view={flow.view} data-tab={tab}>
    {navigation?.({ requestExit: exit, draft: flow.draft, view: flow.view, busy: flow.busy })}
    {flow.view === "preparation" ? <StrategyRecordedWizard draft={flow.draft} onChange={flow.change} catalog={flow.choices} catalogState={flow.choices.length > 0 ? "available" : catalogState} calendar={calendar}
      canOpenDraft={!flow.busy && (flow.stored !== undefined || repositoryVersion !== undefined)}
      openDraftHint={t(flow.sessions.busy ? "strategy.recorded.busy" : repositoryLoading ? "strategy.workspace.repositoryLoading" : "strategy.workspace.repositoryUnavailable")}
      onRetryOpenDraft={!flow.busy && !repositoryLoading ? onRetryRepository : undefined}
      onDiscover={discover} sessions={sourceView} onOpenDraft={() => void flow.openEditor()} onExit={exit} busy={flow.saving} error={error} t={t} />
      : <>
        <nav className="strategy-recorded-tabs" role="tablist" aria-label={t("strategy.data.editorTabs")}>{(["race", "data", "plan", "revisions"] as const).map((item, index, tabs) => <button key={item} id={`recorded-tab-${item}`} type="button" role="tab" aria-selected={tab === item} aria-controls={`recorded-panel-${item}`} tabIndex={tab === item ? 0 : -1} onClick={() => { setTab(item); if (item === "data") setDataVisited(true); }} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined;
          if (next === undefined) return;
          event.preventDefault(); setTab(tabs[next]); if (tabs[next] === "data") setDataVisited(true);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
        }}>{t(`strategy.data.tab.${item}`)}</button>)}</nav>
        <div className="strategy-recorded-editor-panel" id="recorded-panel-race" role="tabpanel" aria-labelledby="recorded-tab-race" hidden={tab !== "race"}><StrategyRecordedOverview draft={flow.draft} dirty={flow.dirty} busy={flow.busy || formPending} error={error} onEdit={edit} onSources={() => setLibraryOpen(true)} onSave={() => void flow.save()} t={t} /></div>
        {dataVisited ? <div className="strategy-recorded-editor-panel" id="recorded-panel-data" role="tabpanel" aria-labelledby="recorded-tab-data" hidden={tab !== "data"}><StrategyRecordedData controller={flow.sessions.corrections} sessionLabels={Object.fromEntries((flow.sessions.candidates ?? []).filter(item => item.displayName).map(item => [item.id, item.displayName!]))} sessions={flow.sessions.sessions.filter(session => flow.draft.sessions.some(ref => ref.sessionId === session.revision.sessionId))} busy={flow.busy} onSources={() => setLibraryOpen(true)} onPendingChange={setFormPending} t={t} /></div> : null}
        {(["plan", "revisions"] as const).map(item => <div className="strategy-recorded-editor-panel" id={`recorded-panel-${item}`} key={item} role="tabpanel" aria-labelledby={`recorded-tab-${item}`} hidden={tab !== item}><section className="strategy-recorded-data"><header className="strategy-recorded-data__heading"><h2>{t(`strategy.data.tab.${item}`)}</h2></header><div className="strategy-recorded-data__observations"><h3>{t(item === "plan" ? "strategy.workspace.notCalculated" : "strategy.data.revisionsPending")}</h3><p>{t(item === "plan" ? "strategy.workspace.calculateHint" : "strategy.data.revisionsPendingHint")}</p></div></section></div>)}
      </>}
    <Drawer open={libraryOpen} title={t("strategy.recorded.title")} closeLabel={t("strategy.recorded.close")} onClose={() => setLibraryOpen(false)}>{sourceView}</Drawer>
    <ConfirmDialog open={exitOpen} title={t("strategy.workspace.leaveTitle")} body={t("strategy.workspace.leaveBody")} confirmLabel={t("strategy.workspace.leave")} cancelLabel={t("strategy.recorded.cancel")} onCancel={() => setExitOpen(false)} onConfirm={onExit} />
  </div>;
}
