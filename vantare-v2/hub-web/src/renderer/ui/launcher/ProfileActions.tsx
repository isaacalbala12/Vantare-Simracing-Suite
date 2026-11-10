import { AlertDialog } from "@base-ui/react/alert-dialog";
import { ContextMenu } from "@base-ui/react/context-menu";
import type { ReactElement } from "react";
import type { LauncherProfile } from "../../../contract/generated/contract";
import { actionText as text } from "../../i18n/launcher-actions";
import { Button } from "../Button";
export type ProfileCardAction = "favorite" | "duplicate" | "remove" | "trigger";
export function ProfileCardActions({ children, profile, triggered, disabled, onAction }: {
  children: ReactElement; profile: LauncherProfile; triggered: boolean; disabled: boolean;
  onAction: (action: ProfileCardAction) => void;
}) {
  return <ContextMenu.Root><ContextMenu.Trigger render={children} />
    <ContextMenu.Portal><ContextMenu.Positioner className="v-positioner"><ContextMenu.Popup className="v-popup">
      {[
        { id: "favorite", label: profile.favorite ? text.unfavorite : text.favorite },
        { id: "duplicate", label: text.duplicate }, { id: "remove", label: text.remove },
        { id: "trigger", label: triggered ? text.triggered : text.trigger },
      ].map((item) => <ContextMenu.Item key={item.id} className="v-option" disabled={disabled} onClick={() => onAction(item.id as ProfileCardAction)}>{item.label}</ContextMenu.Item>)}
    </ContextMenu.Popup></ContextMenu.Positioner></ContextMenu.Portal>
  </ContextMenu.Root>;
}
export function RemoveProfileDialog({ name, pending, onCancel, onConfirm }: { name?: string; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <AlertDialog.Root open={name !== undefined} onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
    <AlertDialog.Portal><AlertDialog.Backdrop className="v-backdrop" /><AlertDialog.Popup className="v-dialog">
      <AlertDialog.Title>{text.removeTitle}</AlertDialog.Title><AlertDialog.Description>{text.removeMessage(name ?? "")}</AlertDialog.Description>
      <div className="v-launcher-actions"><Button disabled={pending} onClick={onCancel}>{text.cancel}</Button><Button variant="danger" busy={pending} onClick={onConfirm}>{text.remove}</Button></div>
    </AlertDialog.Popup></AlertDialog.Portal>
  </AlertDialog.Root>;
}
