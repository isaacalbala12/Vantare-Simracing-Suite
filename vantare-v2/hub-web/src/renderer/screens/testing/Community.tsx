import { testingCommunityText as communityText } from "../../i18n/testing-community";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Data";
import { TestingCommunityView } from "../../ui/TestingCommunityView";
import { TestingCard, TestingLayout } from "../../ui/TestingLayout";
import { testingText as text } from "./es";
import { LocalDiagnostic } from "./LocalDiagnostic";
import { useReports } from "./ReportsState";
import { TriageEditor } from "./TriageEditor";

export function TestingCommunity({
  diagnosticOpen = false,
  onDiagnostic,
}: {
  diagnosticOpen?: boolean;
  onDiagnostic: () => void;
}) {
  const state = useReports();
  if (!state.access.verified || state.access.blocked || !state.access.tester)
    return null;
  const blocked = !state.available || state.busy;
  return (
    <TestingLayout
      title={text.sectionTitle}
      description={text.description}
      tools={<Button onClick={onDiagnostic}>{text.diagnostic}</Button>}
    >
      {diagnosticOpen ? (
        <LocalDiagnostic />
      ) : (
        <TestingCommunityView
          reports={state.participation.reports}
          header={
            <TestingCard title={communityText.title}>
              <p>
                {state.participationLoaded
                  ? communityText.loaded
                  : text.reloadHelp}
              </p>
              {state.error && (
                <Callout
                  tone="err"
                  title={
                    state.failure === "coreUnavailable"
                      ? text.offline
                      : state.failure === "denied"
                        ? text.denied
                        : text.failed
                  }
                />
              )}
              <Button
                disabled={blocked}
                onClick={() => void state.refresh().catch(() => {})}
              >
                {text.reload}
              </Button>
            </TestingCard>
          }
          editor={<TriageEditor />}
        />
      )}
    </TestingLayout>
  );
}
