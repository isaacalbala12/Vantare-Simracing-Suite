import {
  closeReportSaveFailureText,
  closeUnsavedReportText,
  testingDiscardText,
} from "../i18n/testing-discard";
import { Button } from "./Button";
import { ActionGroup } from "./ShellLayout";
import { WindowAlertDialog as AlertDialog } from "./WindowDialog";

type Props = {
  open: boolean;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onDismiss?: () => void;
};
export function DiscardReportDialog(props: Props) {
  return <ReportConfirmation {...props} text={testingDiscardText} />;
}
export function CloseUnsavedReportDialog(props: Props) {
  return <ReportConfirmation {...props} text={closeUnsavedReportText} />;
}
export function CloseReportSaveFailureDialog({
  open,
  onRetry,
  onDiscard,
  onDismiss,
}: {
  open: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  onDismiss: () => void;
}) {
  return (
    <ReportConfirmation
      open={open}
      disabled={false}
      onCancel={onRetry}
      onConfirm={onDiscard}
      onDismiss={onDismiss}
      text={closeReportSaveFailureText}
    />
  );
}
function ReportConfirmation({
  open,
  disabled,
  onCancel,
  onConfirm,
  onDismiss,
  text,
}: Props & {
  text: { title: string; description: string; cancel: string; confirm: string };
}) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) (onDismiss ?? onCancel)();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="v-backdrop" />
        <AlertDialog.Popup
          className="v-dialog"
          finalFocus={() =>
            document.querySelector<HTMLElement>(".v-testing .v-input") ?? true
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
