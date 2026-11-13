import { controlText as text } from "../../i18n/launcher-control";
import type { ResidentControlController } from "../../screens/launcher/resident-control";
import { Callout } from "../Data";
export function ResidentControlNotice({
  control,
}: {
  control: ResidentControlController;
}) {
  const attempt = control.attempt,
    phase = attempt?.phase;
  let status = "";
  if (phase) {
    if (phase.kind === "rejected")
      status = `${text.rejected} ${text.rejection[phase.reason]}`;
    else if (phase.kind === "finished")
      status =
        phase.outcome.kind === "completed"
          ? text.completed
          : phase.outcome.kind === "cancelled"
            ? text.cancelled
            : phase.outcome.reason === "cleanup-failed"
              ? text.cleanupFailed
              : text.failed;
    else status = text[phase.kind];
    status = `${attempt?.kind === "cancel" ? text.cancel : text.rehearse}: ${status}`;
  }
  return (
    <section
      aria-label={text.title}
      className={status ? "v-resident-control-notice" : "v-resident-live"}
    >
      <Callout
        title={status}
        tone={
          phase?.kind === "rejected" || phase?.kind === "unknown"
            ? "warn"
            : "info"
        }
      />
    </section>
  );
}
