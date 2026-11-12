import { Menu } from "@base-ui/react/menu";
import {
  cloneElement,
  type HTMLAttributes,
  type ReactElement,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LauncherProfile } from "../../../contract/generated/contract";
import { actionText as text } from "../../i18n/launcher-actions";
import { Button } from "../Button";
import { Callout } from "../Data";
import { WindowDialog as Dialog } from "../WindowDialog";
import "./applications.css";
export type ProfileCardAction = "favorite" | "duplicate" | "remove" | "trigger";
export function ProfileCardActions({
  children,
  profile,
  triggered,
  disabled,
  canDuplicate,
  onAction,
}: {
  children: ReactElement<HTMLAttributes<HTMLElement>>;
  profile: LauncherProfile;
  triggered: boolean;
  disabled: boolean;
  canDuplicate: boolean;
  onAction: (action: ProfileCardAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState({ x: 0, y: 0 });
  const origin = useRef<HTMLElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const keyboard = useRef(false);
  const popupId = useId();
  const anchor = useMemo(
    () => ({
      getBoundingClientRect: () => new DOMRect(point.x, point.y, 0, 0),
    }),
    [point],
  );
  const items: { id: ProfileCardAction; label: string }[] = [
    {
      id: "favorite",
      label: profile.favorite ? text.unfavorite : text.favorite,
    },
    { id: "duplicate", label: text.duplicate },
    { id: "remove", label: text.remove },
    { id: "trigger", label: triggered ? text.triggered : text.trigger },
  ];
  return (
    <Menu.Root
      modal={false}
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(value) => {
        if (value && keyboard.current)
          popup.current
            ?.querySelector<HTMLElement>(
              '[role="menuitem"]:not([aria-disabled="true"])',
            )
            ?.focus();
      }}
    >
      {cloneElement(children, {
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? popupId : undefined,
        onContextMenu: (event) => {
          children.props.onContextMenu?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          keyboard.current = false;
          origin.current = event.currentTarget;
          setPoint({ x: event.clientX, y: event.clientY });
          setOpen(true);
        },
        onKeyDown: (event) => {
          if (
            event.key === "ContextMenu" ||
            (event.key === "F10" && event.shiftKey)
          ) {
            event.preventDefault();
            keyboard.current = true;
            origin.current = event.currentTarget;
            const rect = event.currentTarget.getBoundingClientRect();
            setPoint({ x: rect.left, y: rect.bottom });
            setOpen(true);
          } else children.props.onKeyDown?.(event);
        },
      })}
      <Menu.Portal>
        <Menu.Positioner className="v-positioner" anchor={anchor} align="start">
          <Menu.Popup
            ref={popup}
            id={popupId}
            className="v-popup"
            finalFocus={() => origin.current ?? false}
          >
            {items.map((item) => (
              <Menu.Item
                key={item.id}
                className="v-option"
                disabled={
                  disabled || (item.id === "duplicate" && !canDuplicate)
                }
                onClick={() => {
                  origin.current?.focus({ preventScroll: true });
                  setOpen(false);
                  onAction(item.id);
                }}
              >
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
export function RemoveProfileDialog({
  name,
  duplicate = false,
  pending,
  onCancel,
  onConfirm,
}: {
  name?: string;
  duplicate?: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root
      open={name !== undefined}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="v-backdrop" />
        <Dialog.Popup className="v-launcher-removal">
          <Dialog.Title>
            {duplicate ? text.duplicateTitle : text.removeTitle}
          </Dialog.Title>
          <Dialog.Description>
            {duplicate
              ? text.duplicateMessage(name ?? "")
              : text.removeMessage(name ?? "")}
          </Dialog.Description>
          <div className="v-launcher-actions">
            <Button disabled={pending} onClick={onCancel}>
              {text.cancel}
            </Button>
            <Button
              variant={duplicate ? "primary" : "danger"}
              busy={pending}
              onClick={onConfirm}
            >
              {duplicate ? text.duplicate : text.remove}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ProfileActionFeedback({
  conflict,
  canRetry,
  pending,
  onRetry,
  onDiscard,
}: {
  conflict: boolean;
  canRetry: boolean;
  pending: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <Callout
      tone="err"
      title={conflict ? text.conflict : text.failed}
      actions={
        <>
          {canRetry ? (
            <Button disabled={pending} onClick={onRetry}>
              {text.retry}
            </Button>
          ) : (
            <span>{text.reconfirm}</span>
          )}
          <Button disabled={pending} onClick={onDiscard}>
            {text.discard}
          </Button>
        </>
      }
    />
  );
}
