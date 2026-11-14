import { useId, useRef } from "react";
import type { ResidentRemoveTarget } from "../../../contract/generated/contract";
import { actionText } from "../../i18n/launcher-actions";
import { removalText as text } from "../../i18n/launcher-removal";
import type { ResidentRemovalController } from "../../screens/launcher/resident-removal";
import { sameRemoval } from "../../screens/launcher/resident-removal-model";
import { Button } from "../Button";
import { WindowDialog as Dialog } from "../WindowDialog";
export function CheckedRemovalDialog({
  name,
  target,
  control,
  onClose,
}: {
  name?: string;
  target?: ResidentRemoveTarget;
  control: ResidentRemovalController;
  onClose: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null),
    help = useId();
  const attempt =
    target && control.attempt && sameRemoval(target, control.attempt.target)
      ? control.attempt
      : undefined;
  const phase = attempt?.phase;
  const waiting =
    !!phase && ["sending", "queued", "accepted"].includes(phase.kind);
  const reason = control.reason(target);
  const message =
    phase?.kind === "rejected"
      ? text.reasons[phase.reason]
      : phase
        ? text[phase.kind]
        : reason
          ? text.reasons[reason]
          : undefined;
  return (
    <Dialog.Root
      open={name !== undefined}
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open && !waiting) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="v-backdrop" />
        <Dialog.Popup className="v-launcher-removal" initialFocus={cancel}>
          <Dialog.Title>{text.title}</Dialog.Title>
          <Dialog.Description>{text.message(name ?? "")}</Dialog.Description>
          <p>{text.scope}</p>
          <p id={help} role="status">
            {message}
          </p>
          <div className="v-launcher-actions">
            <Button
              ref={cancel}
              aria-disabled={waiting}
              onClick={() => {
                if (!waiting) onClose();
              }}
            >
              {phase ? text.close : actionText.cancel}
            </Button>
            <Button
              variant="danger"
              aria-disabled={!!phase || !!reason || !target}
              aria-describedby={help}
              onClick={() => {
                if (!phase && !reason && target) void control.remove(target);
              }}
            >
              {text.confirm}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function RemovalFeedback({
  control,
}: {
  control: ResidentRemovalController;
}) {
  const removed = control.attempt?.phase.kind === "removed";
  return (
    <p role="status" className={removed ? undefined : "v-sr-only"}>
      {removed ? text.removed : ""}
    </p>
  );
}
