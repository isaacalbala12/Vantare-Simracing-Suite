import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { Icon } from "../assets/icons/Icon";
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
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
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
        <Popover.Positioner className="v-positioner" align="end" sideOffset={8}>
          <Popover.Popup className="v-popup" aria-label={label}>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
