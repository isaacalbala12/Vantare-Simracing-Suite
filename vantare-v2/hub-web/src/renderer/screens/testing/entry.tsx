import { useState } from "react";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { TestingSummaryRail } from "../../ui/TestingSummaryView";
import { testingText as text } from "./es";
import { useReports } from "./ReportsState";
import { TestingSummary } from "./Summary";
import { Reports, type ReportsView } from "./Testing";
import { TestingRail } from "./TestingRail";
import { useTestingTabs } from "./TestingTabs";

export default function TestingEntry() {
  const { access, participation, receipt } = useReports();
  const { tabs, active, change } = useTestingTabs(access);
  const [reportView, setReportView] = useState<ReportsView>("local");
  function showReports(view: ReportsView) {
    setReportView(view);
    change("reports");
  }
  function onTabChange(tab: string) {
    setReportView("local");
    change(tab);
  }
  return (
    <>
      <SectionChrome
        title={text.sectionTitle}
        tabs={tabs}
        activeTab={active}
        onTabChange={onTabChange}
        rail={
          active === "summary" ? (
            <TestingSummaryRail
              count={participation.reports.length}
              receipts={receipt ? 1 : 0}
            />
          ) : (
            <TestingRail />
          )
        }
      />
      <SectionPanel activeTab={active}>
        {active === "reports" ? (
          <Reports key={reportView} initialView={reportView} />
        ) : active === "summary" ? (
          <TestingSummary
            onNewReport={() => showReports("compose")}
            onDiagnostic={() => showReports("diagnostic")}
          />
        ) : null}
      </SectionPanel>
    </>
  );
}
