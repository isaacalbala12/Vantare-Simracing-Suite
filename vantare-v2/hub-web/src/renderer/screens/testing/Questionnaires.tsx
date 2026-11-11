import { testingQuestionnairesText as questionnaireText } from "../../i18n/testing-questionnaires";
import { Button } from "../../ui/Button";
import { Callout } from "../../ui/Data";
import { TestingCard, TestingLayout } from "../../ui/TestingLayout";
import { TestingQuestionnairesView } from "../../ui/TestingQuestionnairesView";
import { testingText as text } from "./es";
import { useReports } from "./ReportsState";

export function TestingQuestionnaires({
  onDiagnostic,
}: {
  onDiagnostic: () => void;
}) {
  const state = useReports();
  const blocked = !state.available || state.busy || !state.access.tester;
  return (
    <TestingLayout
      title={text.sectionTitle}
      description={text.description}
      tools={<Button onClick={onDiagnostic}>{text.diagnostic}</Button>}
    >
      <TestingCard title={questionnaireText.title}>
        <p>
          {state.participationLoaded
            ? questionnaireText.loaded
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
      <TestingQuestionnairesView
        data={state.participation.questionnaires}
        selected={state.answerDraft.id}
        score={state.answerDraft.score}
        note={state.answerDraft.note}
        blocked={blocked}
        onSelect={state.selectQuestionnaire}
        onScore={(score) =>
          state.setAnswerDraft((current) => ({ ...current, score }))
        }
        onNote={(note) =>
          state.setAnswerDraft((current) => ({ ...current, note }))
        }
        onSave={() => void state.answer().catch(() => {})}
      />
    </TestingLayout>
  );
}
