import { useState } from "react";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { TestingQuestionnairesRail } from "../../ui/TestingQuestionnairesView";
import { TestingSummaryRail } from "../../ui/TestingSummaryView";
import { testingText as text } from "./es";
import { TestingQuestionnaires } from "./Questionnaires";
import { useReports } from "./ReportsState";
import { TestingSummary } from "./Summary";
import { Reports, type ReportsView } from "./Testing";
import { TestingRail } from "./TestingRail";
import { useTestingTabs } from "./TestingTabs";

export default function TestingEntry() {
  const { access, participation } = useReports();
  // GPUI's rail uses its loaded-contribution count for both captions.
  const railCount = participation.reports.length;
  const { tabs, active, change } = useTestingTabs(access);
  const [reportView, setReportView] =
    useState<Exclude<ReportsView, "diagnostic">>("local");
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
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
          active === "summary" ? (
            <TestingSummaryRail count={railCount} receipts={railCount} />
          ) : active === "questionnaires" ? (
            <TestingQuestionnairesRail count={participation.questionnaires.length} />
          ) : (
            <TestingRail />
          )
        }
      />
      <SectionPanel activeTab={active}>
        {diagnosticOpen || active === "reports" ? (
          <Reports
            view={diagnosticOpen ? "diagnostic" : reportView}
            onViewChange={changeReportView}
          />
        ) : active === "summary" ? (
          <TestingSummary
            onNewReport={() => showReports("local")}
            onDiagnostic={() => setDiagnosticOpen(true)}
          />
        ) : active === "questionnaires" ? (
          <TestingQuestionnaires onDiagnostic={() => setDiagnosticOpen(true)} />
        ) : null}
      </SectionPanel>
    </>
  );
}
