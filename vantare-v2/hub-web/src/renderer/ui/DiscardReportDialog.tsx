import { AlertDialog } from "@base-ui/react/alert-dialog";
import { testingDiscardText as text } from "../i18n/testing-discard";
import { Button } from "./Button";
import { ActionGroup } from "./ShellLayout";

export function DiscardReportDialog({
  open,
  disabled,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="v-backdrop" />
        <AlertDialog.Popup
          className="v-dialog"
          finalFocus={() =>
            document.querySelector<HTMLElement>(".v-testing .v-input") ?? false
          }
        >
          <AlertDialog.Title>{text.title}</AlertDialog.Title>
          <AlertDialog.Description>{text.description}</AlertDialog.Description>
          <ActionGroup>
            <Button onClick={onCancel}>{text.cancel}</Button>
            <Button variant="danger" disabled={disabled} onClick={onConfirm}>
              {text.confirm}
            </Button>
          </ActionGroup>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
