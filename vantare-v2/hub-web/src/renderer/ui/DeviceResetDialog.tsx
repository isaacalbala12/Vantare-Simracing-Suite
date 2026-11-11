import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { RefObject } from "react";
import { accountText as text } from "../i18n/account.es";
import { Button } from "./Button";
import { ActionGroup } from "./ShellLayout";
export function DeviceResetDialog({
  open,
  disabled,
  returnFocus,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  disabled: boolean;
  returnFocus: RefObject<HTMLButtonElement | null>;
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
          finalFocus={() => returnFocus.current ?? false}
        >
          <AlertDialog.Title>{text.reset}</AlertDialog.Title>
          <AlertDialog.Description>
            {text.resetDescription}
          </AlertDialog.Description>
          <ActionGroup>
            <Button onClick={onCancel}>{text.cancel}</Button>
            <Button variant="danger" disabled={disabled} onClick={onConfirm}>
              {text.resetConfirm}
            </Button>
          </ActionGroup>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
