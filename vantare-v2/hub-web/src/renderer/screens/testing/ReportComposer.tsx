import { isReportFields } from "../../../contract/testing-validation";
import { ReportComposerView } from "../../ui/ReportComposerView";
import { useReports } from "./ReportsState";
import { reportErrors, reportSuggestion, withReportKind } from "./report-kind";

export function ReportComposer({ onDiscard }: { onDiscard: () => void }) {
  const state = useReports();
  const blocked = !state.available || state.busy;
  const run = (action: () => Promise<void>) => void action().catch(() => {});
  const errors = reportErrors(state.fields);
  const valid =
    isReportFields(state.fields) &&
    withReportKind(
      state.fields.contextText,
      reportSuggestion(state.fields.contextText),
    ) !== undefined;
  const required = [
    state.fields.actionText,
    state.fields.expectedText,
    state.fields.observedText,
  ].every((value) => value.trim());
  return (
    <ReportComposerView
      fields={state.fields}
      errors={errors}
      screenshots={state.screenshots}
      preview={state.preview}
      consent={state.consent}
      dirty={state.dirty}
      draftExists={state.draftExists}
      editBlocked={
        state.busy ||
        (state.available && !state.loaded && !state.error) ||
        !state.access.verified ||
        state.access.blocked
      }
      requestBlocked={blocked}
      saveBlocked={blocked || !state.loaded || !valid}
      prepareBlocked={
        blocked ||
        !state.loaded ||
        !valid ||
        !required ||
        Object.values(errors).some(Boolean) ||
        state.dirty ||
        state.screenshots.length > 0
      }
      suggestion={reportSuggestion(state.fields.contextText)}
      canChooseBug={
        withReportKind(state.fields.contextText, false) !== undefined
      }
      canChooseSuggestion={
        withReportKind(state.fields.contextText, true) !== undefined
      }
      onEdit={state.edit}
      onKind={(suggestion) => {
        const contextText = withReportKind(
          state.fields.contextText,
          suggestion,
        );
        if (contextText !== undefined) state.edit({ contextText });
      }}
      onLoad={() => run(state.load)}
      onRetry={() => run(() => state.prepare(true))}
      onSave={() => run(state.save)}
      onPrepare={() => run(state.prepare)}
      onDiscard={onDiscard}
      onConsent={state.setConsent}
      onSend={() => run(state.send)}
      onRemove={(id) => run(() => state.removeScreenshot(id))}
    />
  );
}
