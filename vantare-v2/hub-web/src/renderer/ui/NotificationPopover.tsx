import { Popover } from "@base-ui/react/popover";
import { type ReactNode, useCallback, useRef } from "react";
import { Icon } from "../assets/icons/Icon";
import { useWindowDialogSurface, WindowDialogProvider } from "./WindowDialog";

function NotificationPopup({
  label,
  open,
  close,
  children,
}: {
  label: string;
  open: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const node = useRef<HTMLDivElement>(null);
  useWindowDialogSurface(node, open, close);
  return (
    <Popover.Popup
      ref={node}
      className="v-popup"
      aria-label={label}
      data-window-dialog="screen"
    >
      {children}
    </Popover.Popup>
  );
}
export function NotificationPopover({
  label,
  open,
  onOpenChange,
  children,
  unread = 0,
}: {
  label: string;
  unread?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  return (
    <WindowDialogProvider>
      <Popover.Root
        modal={false}
        open={open}
        onOpenChange={(value, event) => {
          // Caption buttons remain in the common focus cycle. Their focus must not
          // dismiss the popup; dialog-safety prevents every unsafe background focus.
          if (!value && event.reason === "focus-out") {
            event.cancel();
            return;
          }
          onOpenChange(value);
        }}
      >
        <Popover.Trigger
          aria-label={label}
          className="v-button v-button--ghost v-notification-bell"
        >
          <Icon name="i-campana" />
          {unread > 0 && (
            <span className="v-notification-bell-count" aria-hidden="true">
              {unread}
            </span>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            className="v-positioner"
            align="end"
            sideOffset={8}
          >
            <NotificationPopup label={label} open={open} close={close}>
              {children}
            </NotificationPopup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </WindowDialogProvider>
  );
}
