import { useState } from "react";
import type { Calendar } from "../../calendar/calendar-types";
import type { AnalysisClient } from "../../strategy/analysis-client";
import type { StrategyApplicationClient } from "../../strategy/strategy-application-client";
import { ConfirmDialog, Drawer } from "../../ui/orbit";
import { useHubSuspendBlocker } from "../hub-suspend-guard";
import type { RecordedDraftPayload } from "./strategy-recorded-payload";
import type { StoredRecordedDraft } from "./strategy-recorded-persistence";
import type { RecordedCombination, RecordedWizardStep } from "./strategy-recorded-wizard";
import { useRecordedWorkflow } from "./use-recorded-workflow";
import { StrategyRecordedWizard } from "./StrategyRecordedWizard";
import { StrategyRecordedOverview } from "./StrategyRecordedOverview";
import { StrategyRecordedSessionsView } from "./StrategyRecordedSessions";

/** Mount once per event. Views never own or dispose the opened Analysis files. */
export function StrategyRecordedWorkflow({ eventId, repositoryVersion, initial, catalog, catalogState, calendar, application, analysis, onExit, onCleanupError, t }: {
  readonly eventId: string; readonly repositoryVersion?: number; readonly initial?: StoredRecordedDraft;
  readonly catalog: readonly RecordedCombination[]; readonly catalogState: "loading" | "available" | "unavailable";
  readonly calendar: Calendar | null; readonly application: StrategyApplicationClient<RecordedDraftPayload>;
  readonly analysis?: AnalysisClient; readonly onExit: () => void; readonly onCleanupError: () => void; readonly t: (key: string) => string;
}) {
  const flow = useRecordedWorkflow({ eventId, repositoryVersion, initial, catalog, application, analysis, onCleanupError });
  useHubSuspendBlocker(`strategy-recorded:${eventId}`, t("strategy.workspace.unsaved"), flow.dirty || flow.busy);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const discover = () => { setLibraryOpen(true); void flow.sessions.discover(); };
  const edit = (step: RecordedWizardStep) => { flow.change({ ...flow.draft, step }); flow.prepare(); };
  const exit = () => { if (flow.busy) return; if (flow.dirty) setExitOpen(true); else onExit(); };
  const error = flow.error || flow.proposalError ? t("strategy.workspace.operationFailed") : undefined;
  const sourceView = <StrategyRecordedSessionsView controller={flow.sessions} t={t} />;
  return <div className="strategy-recorded-workflow" data-view={flow.view}>
    {flow.view === "preparation" ? <StrategyRecordedWizard draft={flow.draft} onChange={flow.change} catalog={flow.choices} catalogState={catalogState} calendar={calendar}
      onDiscover={discover} sessions={sourceView} onOpenDraft={() => void flow.openEditor()} onExit={exit} busy={flow.saving} error={error} t={t} />
      : <StrategyRecordedOverview draft={flow.draft} dirty={flow.dirty} busy={flow.busy} error={error} onEdit={edit} onSources={() => setLibraryOpen(true)} onSave={() => void flow.save()} t={t} />}
    <Drawer open={libraryOpen} title={t("strategy.recorded.title")} closeLabel={t("strategy.recorded.close")} onClose={() => setLibraryOpen(false)}>{sourceView}</Drawer>
    <ConfirmDialog open={exitOpen} title={t("strategy.workspace.leaveTitle")} body={t("strategy.workspace.leaveBody")} confirmLabel={t("strategy.workspace.leave")} cancelLabel={t("strategy.recorded.cancel")} onCancel={() => setExitOpen(false)} onConfirm={onExit} />
  </div>;
}
