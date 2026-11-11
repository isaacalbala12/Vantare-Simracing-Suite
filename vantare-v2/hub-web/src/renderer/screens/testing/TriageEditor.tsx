import { TriageEditorView } from "../../ui/TriageEditorView";
import { useReports } from "./ReportsState";
export function TriageEditor() {
  const state = useReports(),
    triage = state.triage;
  return (
    <TriageEditorView
      title={triage.title}
      body={triage.body}
      items={triage.items}
      consent={triage.consent}
      preview={triage.preview}
      blocked={
        !state.available || state.busy || triage.pending || !state.access.tester
      }
      onTitle={triage.editTitle}
      onBody={triage.editBody}
      onChoice={triage.choose}
      onConsent={triage.accept}
      onPrepare={() => void triage.prepareReport().catch(() => {})}
      onSend={() => void triage.sendReport().catch(() => {})}
    />
  );
}
