import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { Toast as BaseToast } from "@base-ui/react/toast";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { type HTMLAttributes, isValidElement, type ReactNode } from "react";
import { Icon } from "../assets/icons/Icon";
export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={<span className="v-tooltip-trigger" />}>
        {children}
      </BaseTooltip.Trigger>
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner className="v-positioner" sideOffset={6}>
          <BaseTooltip.Popup className="v-tooltip">
            {label}
            <BaseTooltip.Arrow />
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
export const TooltipProvider = BaseTooltip.Provider;
export function Dialog({
  title,
  description,
  trigger,
  children,
  closeLabel,
  open,
  onOpenChange,
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  children: ReactNode;
  closeLabel: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Trigger
        className="v-button v-button--neutral"
        render={
          isValidElement<HTMLAttributes<HTMLElement>>(trigger)
            ? trigger
            : undefined
        }
      >
        {isValidElement(trigger) ? undefined : trigger}
      </BaseDialog.Trigger>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="v-backdrop" />
        <BaseDialog.Popup className="v-dialog">
          <BaseDialog.Title>{title}</BaseDialog.Title>
          <BaseDialog.Description className="v-muted">
            {description}
          </BaseDialog.Description>
          {children}
          <BaseDialog.Close className="v-button v-button--ghost">
            {closeLabel}
          </BaseDialog.Close>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
export function AlertDialog({
  title,
  description,
  trigger,
  children,
  closeLabel,
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  children: ReactNode;
  closeLabel: string;
}) {
  return (
    <BaseAlertDialog.Root>
      <BaseAlertDialog.Trigger
        className="v-button"
        render={
          isValidElement<HTMLAttributes<HTMLElement>>(trigger)
            ? trigger
            : undefined
        }
      >
        {isValidElement(trigger) ? undefined : trigger}
      </BaseAlertDialog.Trigger>
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop className="v-backdrop" />
        <BaseAlertDialog.Popup className="v-dialog">
          <BaseAlertDialog.Title>{title}</BaseAlertDialog.Title>
          <BaseAlertDialog.Description>
            {description}
          </BaseAlertDialog.Description>
          {children}
          <BaseAlertDialog.Close className="v-button">
            {closeLabel}
          </BaseAlertDialog.Close>
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}
export function Popover({
  label,
  trigger,
  children,
  open,
  onOpenChange,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger
        aria-label={label}
        className="v-button v-button--ghost"
      >
        {trigger}
      </BasePopover.Trigger>
      <BasePopover.Portal>
        <BasePopover.Positioner className="v-positioner" sideOffset={6}>
          <BasePopover.Popup className="v-popup" aria-label={label}>
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
export function Menu({
  label,
  items,
}: {
  label: string;
  items: {
    id: string;
    label: string;
    disabled?: boolean;
    onSelect: () => void;
  }[];
}) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger className="v-button">{label}</BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner className="v-positioner" sideOffset={6}>
          <BaseMenu.Popup className="v-popup">
            {items.map((item) => (
              <BaseMenu.Item
                key={item.id}
                className="v-option"
                disabled={item.disabled}
                onClick={item.onSelect}
              >
                {item.label}
              </BaseMenu.Item>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
export const ToastProvider = BaseToast.Provider;
export const useToastManager = BaseToast.useToastManager;
export function ToastViewport({ closeLabel }: { closeLabel: string }) {
  const { toasts } = BaseToast.useToastManager();
  return (
    <BaseToast.Portal>
      <BaseToast.Viewport className="v-toast-viewport">
        {toasts.map((toast) => (
          <BaseToast.Root key={toast.id} toast={toast} className="v-toast">
            <BaseToast.Content>
              <BaseToast.Title />
              <BaseToast.Description />
              <BaseToast.Close
                aria-label={closeLabel}
                className="v-button v-button--ghost"
              >
                <Icon name="i-chevron" />
              </BaseToast.Close>
            </BaseToast.Content>
          </BaseToast.Root>
        ))}
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}
