import { useId } from "react";
import { controlText as text } from "../../i18n/launcher-control";
import type { ResidentControlController } from "../../screens/launcher/resident-control";
import { Button } from "../Button";
import { Callout } from "../Data";
export function ResidentControlNotice({
  control,
  showCancel = false,
}: {
  control: ResidentControlController;
  showCancel?: boolean;
}) {
  const help = useId();
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
  const target = showCancel ? control.cancelTarget : undefined;
  const reason = target
    ? control.reason({ kind: "cancel", target })
    : undefined;
  if (target && !status) status = reason ? text[reason] : text.cancelHelp;
  return (
    <section
      aria-label={text.title}
      className={status ? "v-resident-control-notice" : "v-resident-live"}
    >
      {target && (
        <span id={help} className="v-resident-live">
          {reason ? text[reason] : text.cancelHelp}
        </span>
      )}
      <Callout
        title={status}
        actions={
          target ? (
            <Button
              aria-describedby={help}
              aria-disabled={!!reason}
              onClick={() => {
                if (!reason) void control.cancel(target);
              }}
            >
              {text.cancelAction}
            </Button>
          ) : undefined
        }
        tone={
          phase?.kind === "rejected" || phase?.kind === "unknown"
            ? "warn"
            : "info"
        }
      />
    </section>
  );
}
