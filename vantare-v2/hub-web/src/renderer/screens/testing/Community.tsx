import { testingParticipationLabel } from "../../../mock/testing-participation";
import { testingCommunityText as communityText } from "../../i18n/testing-community";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Data";
import { TestingCommunityView } from "../../ui/TestingCommunityView";
import { TestingCard, TestingLayout } from "../../ui/TestingLayout";
import { testingText as text } from "./es";
import { useReports } from "./ReportsState";
import { TriageEditor } from "./TriageEditor";

declare const __VANTARE_RENDERER_MOCK__: boolean;

export function TestingCommunity({
  onDiagnostic,
}: {
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
      <TestingCommunityView
        reports={state.participation.reports}
        header={
          <TestingCard title={communityText.title}>
            <p>
              {state.participationLoaded
                ? __VANTARE_RENDERER_MOCK__
                  ? testingParticipationLabel(communityText.loaded)
                  : communityText.loaded
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
    </TestingLayout>
  );
}
