import { Menu } from "@base-ui/react/menu";
import { type Ref, useState } from "react";
import { Icon } from "../../assets/icons/Icon";
import { strategy } from "../../i18n/strategy";
import {
  type ExportState,
  exportFailure,
} from "../../screens/strategy/strategyExport";
import { Button } from "../Button";

const t = strategy.calc.export;

// What the screen can do with the plan it shows: copy it as text, save it as a
// spreadsheet, or put away the notice of the last try. The text goes to the
// clipboard from the main process and the file is chosen and written by it and
// the host: the screen only asks, and says what came of it.
export type ExportActions = {
  // the plan on view can be exported (and which one: see `exportTarget`)
  available: boolean;
  // the plan is a proposal that was not accepted: the text will say so
  proposal: boolean;
  state: ExportState;
  copy: () => void;
  save: () => void;
  // the same try again, with the window that lets the person choose
  retry: () => void;
  dismiss: () => void;
  // another action is running: the menu does not open meanwhile
  pending: boolean;
};

// «Exportar», a button with a menu of two ways. While the window to save the file is
// open the button stays where the focus is, and says «Exportando…».
export function ExportMenu({
  actions,
  triggerRef,
}: {
  actions: ExportActions;
  triggerRef: Ref<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const waiting = actions.state.status === "waiting";
  // never `disabled`: a disabled button cannot keep the focus the menu gives back
  const blocked = waiting || actions.pending;
  return (
    <span className="strategy-export">
      {actions.state.status === "copied" && (
        <span className="strategy-export-done">
          <span className="strategy-export-icon">
            <Icon name="check" />
          </span>
          {t.copied}
        </span>
      )}
      <Menu.Root
        modal={false}
        open={open && !blocked}
        onOpenChange={(next) => setOpen(next && !blocked)}
      >
        <Menu.Trigger
          ref={triggerRef}
          aria-disabled={blocked || undefined}
          className="v-button v-button--ghost v-button--md strategy-export-trigger"
        >
          <Icon name="v-download" />
          {waiting ? t.working : t.action}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="v-positioner" align="end" sideOffset={6}>
            <Menu.Popup
              className="v-popup strategy-export-popup"
              aria-label={t.menu}
            >
              <Menu.Group>
                {actions.proposal && (
                  <Menu.GroupLabel className="strategy-export-note">
                    <span className="strategy-export-icon">
                      <Icon name="info" />
                    </span>
                    <span>{t.proposalNote}</span>
                  </Menu.GroupLabel>
                )}
                <Menu.Item
                  className="v-option strategy-menu-item strategy-export-item"
                  onClick={actions.copy}
                >
                  <span className="strategy-export-icon">
                    <Icon name="copy" />
                  </span>
                  <strong>{t.text.title}</strong>
                  <small>{t.text.detail}</small>
                </Menu.Item>
                <Menu.Item
                  className="v-option strategy-menu-item strategy-export-item"
                  onClick={actions.save}
                >
                  <span className="strategy-export-icon">
                    <Icon name="v-download" />
                  </span>
                  <strong>{t.file.title}</strong>
                  <small>{t.file.detail}</small>
                </Menu.Item>
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </span>
  );
}

// What came of the last try to save the file, under the title of the plan: the
// window that is open, the name it was saved with, a refusal. A refusal is an
// alert; the rest is quiet, because the single status line already said it.
export function ExportNotice({
  state,
  retry,
  dismiss,
}: {
  state: ExportState;
  // the same try again, with the window that lets the person choose
  retry: () => void;
  dismiss: () => void;
}) {
  if (state.status === "waiting")
    return (
      <div className="strategy-notice strategy-export-notice" data-tone="info">
        <span className="strategy-icon">
          <Icon name="v-download" />
        </span>
        <div>
          <strong>{t.waiting.title}</strong>
          <p>{t.waiting.detail}</p>
        </div>
        <span className="strategy-spinner" aria-hidden="true" />
      </div>
    );
  if (state.status === "saved" || state.status === "expired") {
    const saved = state.status === "saved";
    return (
      <div
        className="strategy-notice strategy-export-notice"
        data-tone={saved ? "ok" : "info"}
      >
        <span className="strategy-icon">
          <Icon name={saved ? "check" : "info"} />
        </span>
        <div>
          <strong>{saved ? t.saved.title : t.expired.title}</strong>
          <p>{saved ? t.saved.detail(state.name) : t.expired.detail}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          <Icon name="x" />
          {t.dismiss}
        </Button>
      </div>
    );
  }
  if (state.status === "failed") {
    const failure = exportFailure(state.kind, state.via);
    return (
      <div
        className="strategy-notice strategy-export-notice"
        data-tone="error"
        role="alert"
      >
        <span className="strategy-icon">
          <Icon name="alert" />
        </span>
        <div>
          <strong>{failure.title}</strong>
          <p>{failure.detail}</p>
          <div className="strategy-actions">
            {failure.retry && (
              <Button size="sm" variant="primary" onClick={retry}>
                {failure.retry}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={dismiss}>
              {t.dismiss}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
