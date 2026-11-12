import { calendarIcsText as text } from "../i18n/calendarIcs";
import { Button } from "./Button";
import { ActionGroup } from "./ShellLayout";
import { WindowAlertDialog as Dialog } from "./WindowDialog";
export function CalendarIcsReplacement({
  busy,
  onReplace,
  returnFocus,
}: {
  busy: boolean;
  onReplace?: (replace: boolean) => void;
  returnFocus: () => HTMLElement | false;
}) {
  const answer = (value: boolean) => {
    if (!busy) onReplace?.(value);
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) answer(false);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="v-backdrop" />
        <Dialog.Popup className="v-dialog" finalFocus={returnFocus}>
          <Dialog.Title>{text.replaceTitle}</Dialog.Title>
          <Dialog.Description>{text.replaceDescription}</Dialog.Description>
          <ActionGroup>
            <Button aria-disabled={busy} onClick={() => answer(false)}>
              {text.cancel}
            </Button>
            <Button
              variant="primary"
              aria-disabled={busy}
              onClick={() => answer(true)}
            >
              {text.replaceConfirm}
            </Button>
          </ActionGroup>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
