import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { Icon } from "../assets/icons/Icon";
export function NotificationPopover({
  label,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger aria-label={label} className="v-button v-button--ghost">
        <Icon name="i-campana" />
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
