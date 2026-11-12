import { useEffect, useState } from "react";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { useUi } from "../../app/UiState";
import { Callout } from "../../ui/Data";
import { TestingQuestionnairesRail } from "../../ui/TestingQuestionnairesView";
import { TestingSummaryRail } from "../../ui/TestingSummaryView";
import { TestingCommunity } from "./Community";
import { testingText as text } from "./es";
import { TestingQuestionnaires } from "./Questionnaires";
import { useReports } from "./ReportsState";
import { TestingSummary } from "./Summary";
import { Reports, type ReportsView } from "./Testing";
import { TestingRail } from "./TestingRail";
import { useTestingTabs } from "./TestingTabs";

export default function TestingEntry() {
  const {
    access,
    participation,
    refresh,
    available,
    busy,
    sessionDiscarded,
    dismissSessionDiscarded,
  } = useReports();
  useEffect(() => () => dismissSessionDiscarded(), [dismissSessionDiscarded]);
  const requested = useUi((state) => state.testingReportsRequested);
  const consume = useUi((state) => state.consumeTestingReports);
  // GPUI's rail uses its loaded-contribution count for both captions.
  const railCount = participation.reports.length;
  const { tabs, active: selected, change } = useTestingTabs(access);
  const active = requested ? "reports" : selected;
  const [reportView, setReportView] =
    useState<Exclude<ReportsView, "diagnostic">>("local");
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  useEffect(() => {
    if (!requested) return;
    setDiagnosticOpen(false);
    setReportView("list");
    change("reports");
    consume();
    if (available && !busy) void refresh();
  }, [requested, change, consume, available, busy, refresh]);
  function showReports(view: Exclude<ReportsView, "diagnostic">) {
    setDiagnosticOpen(false);
    setReportView(view);
    change("reports");
  }
  function changeReportView(view: ReportsView) {
    if (view === "diagnostic") setDiagnosticOpen(true);
    else if (diagnosticOpen) setDiagnosticOpen(false);
    else setReportView(view);
  }
  return (
    <>
      <SectionChrome
        title={text.sectionTitle}
        tabs={tabs}
        activeTab={active}
        onTabChange={change}
        rail={
          active === "summary" || active === "community" ? (
            <TestingSummaryRail count={railCount} receipts={railCount} />
          ) : active === "questionnaires" ? (
            <TestingQuestionnairesRail
              count={participation.questionnaires.length}
            />
          ) : (
            <TestingRail />
          )
        }
      />
      <SectionPanel activeTab={active}>
        {sessionDiscarded && (
          <div role="status">
            <Callout tone="warn" title={text.sessionDiscarded} />
          </div>
        )}
        {diagnosticOpen || active === "reports" ? (
          <Reports
            view={
              requested ? "list" : diagnosticOpen ? "diagnostic" : reportView
            }
            onViewChange={changeReportView}
          />
        ) : active === "summary" ? (
          <TestingSummary
            onNewReport={() => showReports("local")}
            onDiagnostic={() => setDiagnosticOpen(true)}
          />
        ) : active === "questionnaires" ? (
          <TestingQuestionnaires onDiagnostic={() => setDiagnosticOpen(true)} />
        ) : active === "community" ? (
          <TestingCommunity onDiagnostic={() => setDiagnosticOpen(true)} />
        ) : null}
      </SectionPanel>
    </>
  );
}
