import { AlertDialog } from "@base-ui/react/alert-dialog";
import {
  closeUnsavedReportText,
  testingDiscardText,
} from "../i18n/testing-discard";
import { Button } from "./Button";
import { ActionGroup } from "./ShellLayout";

type Props = {
  open: boolean;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};
export function DiscardReportDialog(props: Props) {
  return <ReportConfirmation {...props} text={testingDiscardText} />;
}
export function CloseUnsavedReportDialog(props: Props) {
  return <ReportConfirmation {...props} text={closeUnsavedReportText} />;
}
function ReportConfirmation({
  open,
  disabled,
  onCancel,
  onConfirm,
  text,
}: Props & {
  text: { title: string; description: string; cancel: string; confirm: string };
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
