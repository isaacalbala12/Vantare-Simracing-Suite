import { Button } from "../../ui/Button";
import { TestingLayout } from "../../ui/TestingLayout";
import { TestingSummaryView } from "../../ui/TestingSummaryView";
import { testingText as text } from "./es";
import { ReportsPanel } from "./Testing";

export function TestingSummary({
  onNewReport,
  onDiagnostic,
}: {
  onNewReport: () => void;
  onDiagnostic: () => void;
}) {
  return (
    <TestingLayout
      title={text.sectionTitle}
      description={text.description}
      tools={<Button onClick={onDiagnostic}>{text.diagnostic}</Button>}
    >
      <TestingSummaryView onNewReport={onNewReport}>
        <ReportsPanel />
      </TestingSummaryView>
    </TestingLayout>
  );
}
