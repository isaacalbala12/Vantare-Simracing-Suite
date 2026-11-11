import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

// A disabled native control cannot receive focus to explain its availability.
export function DisabledHint({
  label,
  children,
  disabled = true,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={<fieldset className="v-studio-disabled-hint" />}
        tabIndex={disabled ? 0 : undefined}
        aria-label={disabled ? label : undefined}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner className="v-positioner" sideOffset={6}>
          <Tooltip.Popup className="v-tooltip" role="tooltip">
            {label}
            <Tooltip.Arrow />
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
