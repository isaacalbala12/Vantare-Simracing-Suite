import { TestingRailSection } from "../../ui/TestingLayout";
import { testingText as text } from "./es";
import { useReports } from "./ReportsState";

export function TestingRail() {
  const { participation } = useReports();
  const count = participation.reports.length;
  const accepted = participation.reports.filter(
    (report) => report.state === "accepted",
  ).length;
  const fixed = participation.reports.filter(
    (report) => report.state === "fixed",
  ).length;
  return (
    <>
      <TestingRailSection title={text.yourReports}>
        <p>{`${count} ${text.loadedReports} · ${accepted} ${text.acceptedReports} · ${fixed} ${text.fixedReports} · ${text.channelUnavailable}`}</p>
      </TestingRailSection>
      <TestingRailSection title={text.conversation} icon="v-chat">
        <p>{text.conversationHelp}</p>
      </TestingRailSection>
      <TestingRailSection title={text.goodReport}>
        <p>{text.goodReportHelp}</p>
      </TestingRailSection>
    </>
  );
}
