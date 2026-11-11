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
  canDuplicate,
  onAction,
}: {
  children: ReactElement;
  profile: LauncherProfile;
  triggered: boolean;
  disabled: boolean;
  canDuplicate: boolean;
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
                disabled={
                  disabled || (item.id === "duplicate" && !canDuplicate)
                }
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
