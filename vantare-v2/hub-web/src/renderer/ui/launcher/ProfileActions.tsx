import { ContextMenu } from "@base-ui/react/context-menu";
import { Dialog } from "@base-ui/react/dialog";
import type { ReactElement } from "react";
import type { LauncherProfile } from "../../../contract/generated/contract";
import { actionText as text } from "../../i18n/launcher-actions";
import { Button } from "../Button";
import { Callout } from "../Data";
import "./applications.css";
export type ProfileCardAction = "favorite" | "duplicate" | "remove" | "trigger";
export function ProfileCardActions({
  children,
  profile,
  triggered,
  disabled,
  onAction,
}: {
  children: ReactElement;
  profile: LauncherProfile;
  triggered: boolean;
  disabled: boolean;
  onAction: (action: ProfileCardAction) => void;
}) {
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
    <ContextMenu.Root>
      <ContextMenu.Trigger render={children} />
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="v-positioner">
          <ContextMenu.Popup className="v-popup">
            {items.map((item) => (
              <ContextMenu.Item
                key={item.id}
                className="v-option"
                disabled={disabled}
                onClick={() => onAction(item.id)}
              >
                {item.label}
              </ContextMenu.Item>
            ))}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
export function RemoveProfileDialog({
  id,
  pending,
  onCancel,
  onConfirm,
}: {
  id?: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root
      open={id !== undefined}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="v-backdrop" />
        <Dialog.Popup className="v-launcher-removal">
          <Dialog.Title>{text.removeTitle}</Dialog.Title>
          <Dialog.Description>
            {text.removeMessage(id ?? "")}
          </Dialog.Description>
          <div className="v-launcher-actions">
            <Button disabled={pending} onClick={onCancel}>
              {text.cancel}
            </Button>
            <Button variant="danger" busy={pending} onClick={onConfirm}>
              {text.remove}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ProfileActionFeedback({
  conflict,
  pending,
  onRetry,
  onDiscard,
}: {
  conflict: boolean;
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
          <Button disabled={pending} onClick={onRetry}>
            {text.retry}
          </Button>
          <Button disabled={pending} onClick={onDiscard}>
            {text.discard}
          </Button>
        </>
      }
    />
  );
}
