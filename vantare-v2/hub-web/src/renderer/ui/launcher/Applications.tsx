import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog } from "@base-ui/react/dialog";
import type {
  AppDraft,
  AppEditor,
  CatalogApp,
  CatalogView,
  PickedApp,
} from "../../../contract/generated/contract";
import { profileLimits } from "../../../contract/generated/contract";
import { appText as text } from "../../i18n/launcher-apps";
import { Button, IconButton } from "../Button";
import { Callout } from "../Data";
import { Input } from "../Forms";
import { Tooltip } from "../Layers";
import { AppMark } from "./Profiles";
import "./applications.css";

export function ApplicationCatalog({
  value,
  query,
  pending,
  error,
  onQuery,
  onReload,
  onScan,
  onEdit,
  onFavorite,
  onRemove,
  onRetry,
  onDiscard,
}: {
  value: CatalogView;
  query: string;
  pending: boolean;
  error?: string;
  onQuery: (value: string) => void;
  onReload: () => void;
  onScan: () => void;
  onEdit: (id: string | null) => void;
  onFavorite: (app: CatalogApp) => void;
  onRemove: (app: CatalogApp) => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const normalized = (value: string) =>
    value.toLocaleLowerCase("es").replace(/\s/g, "");
  const apps = value.apps
    .filter((app) =>
      normalized(`${app.name}${app.category}`).includes(normalized(query)),
    )
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name),
    );
  return (
    <div className="v-launcher-page v-launcher-applications">
      <header className="v-launcher-heading">
        <div>
          <h1>{text.title}</h1>
          <p>{text.help}</p>
        </div>
      </header>
      {error && (
        <Callout
          tone="err"
          title={error}
          actions={
            <div className="v-launcher-actions">
              <Button disabled={pending} onClick={onRetry}>
                {text.retry}
              </Button>
              <Button disabled={pending} onClick={onDiscard}>
                {text.discard}
              </Button>
            </div>
          }
        />
      )}
      <div className="v-launcher-app-search">
        <Input
          label={text.search}
          type="search"
          placeholder={text.search}
          value={query}
          onChange={(event) => onQuery(event.currentTarget.value)}
        />
        <div className="v-launcher-actions">
          <Tooltip label={text.detectionBusy}>
            <span>
              <Button disabled={pending || value.scanning} onClick={onScan}>
                {value.scanning ? text.detecting : text.detect}
              </Button>
            </span>
          </Tooltip>
          <Button disabled={pending} onClick={onReload}>
            {text.reload}
          </Button>
        </div>
      </div>
      <section
        className="v-launcher-catalog"
        aria-label={text.title}
        aria-busy={pending}
      >
        <header>
          <h2>{text.title}</h2>
          <span>
            {value.apps.some((app) => app.found)
              ? text.detectedCount(value.apps.filter((app) => app.found).length)
              : text.catalogCount(value.apps.length)}
          </span>
        </header>
        <div className="v-launcher-catalog-body">
          <div className="v-launcher-app-rows">
            {apps.map((app) => (
              <div className="v-launcher-app-row" key={app.id}>
                <AppMark
                  app={{ id: app.id, name: app.name, available: app.found }}
                />
                <button
                  type="button"
                  className="v-launcher-app-name"
                  disabled={pending}
                  aria-label={text.edit(app.name)}
                  onClick={() => onEdit(app.id)}
                >
                  <strong>{app.name}</strong>
                  <small>{text.method(app.category, app.steam)}</small>
                </button>
                <span className="v-launcher-app-status" data-found={app.found}>
                  {value.scanning
                    ? text.scanning
                    : app.installed
                      ? text.installed
                      : app.found
                        ? text.detected
                        : text.catalog}
                </span>
                <span
                  className="v-launcher-app-favorite"
                  data-favorite={app.favorite}
                >
                  <IconButton
                    label={text.favorite(app.name)}
                    disabled={pending}
                    variant="ghost"
                    onClick={() => onFavorite(app)}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 16 16"
                      fill={app.favorite ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M8 1.9l1.83 3.86 4.17.6-3 3 .71 4.24L8 11.6l-3.71 2l.71-4.24-3-3 4.17-.6z" />
                    </svg>
                  </IconButton>
                </span>
                {app.removable && (
                  <IconButton
                    label={text.removeLabel(app.name)}
                    disabled={pending}
                    variant="ghost"
                    onClick={() => onRemove(app)}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2.8 4.3h10.4M6.4 4.3V2.9h3.2v1.4M4.3 4.3l.6 8.2h6.2l.6-8.2M6.7 6.7v3.6M9.3 6.7v3.6" />
                    </svg>
                  </IconButton>
                )}
              </div>
            ))}
          </div>
          {!apps.length && <p className="v-muted">{text.empty}</p>}
          <button
            type="button"
            className="v-launcher-add-app"
            disabled={pending}
            onClick={() => onEdit(null)}
          >
            <span aria-hidden="true">{text.plus}</span>
            <span>
              <strong>{text.add}</strong>
              <small>{text.addHelp}</small>
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}

export function ApplicationFields({
  value,
  selected,
  pending,
  error,
  official,
  onChange,
  onPick,
  onDiscovery,
  onSave,
  onCancel,
  onRetry,
  onDiscard,
}: {
  value: AppEditor;
  selected: PickedApp | null;
  pending: boolean;
  error?: string;
  official: boolean;
  onChange: (draft: AppDraft) => void;
  onPick: () => void;
  onDiscovery: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <section
      className="v-launcher-catalog v-launcher-app-editor"
      aria-label={text.editor}
    >
      <header>
        <h2>{text.editor}</h2>
      </header>
      <div className="v-launcher-catalog-body">
        {error && (
          <Callout
            tone="err"
            title={error}
            actions={
              <div className="v-launcher-actions">
                <Button disabled={pending} onClick={onRetry}>
                  {text.retry}
                </Button>
                <Button disabled={pending} onClick={onDiscard}>
                  {text.discard}
                </Button>
              </div>
            }
          />
        )}
        <Input
          label={text.name}
          description={text.nameHelp}
          maxLength={profileLimits.name}
          value={value.draft.name}
          disabled={pending}
          onChange={(event) =>
            onChange({ ...value.draft, name: event.currentTarget.value })
          }
        />
        <p className="v-muted">
          {value.hasCustomArguments
            ? text.customArguments
            : text.defaultArguments}
        </p>
        <div className="v-launcher-executable">
          <strong>{text.executable}</strong>
          <p>{text.executableHelp}</p>
          <div className="v-launcher-actions">
            <span>
              {selected?.name ??
                (value.draft.useDiscovery || !value.hasExecutable
                  ? text.automatic
                  : text.configured)}
            </span>
            <Button disabled={pending} onClick={onPick}>
              {text.pick}
            </Button>
            {official && (
              <Button disabled={pending} onClick={onDiscovery}>
                {text.discovery}
              </Button>
            )}
          </div>
        </div>
        <div className="v-launcher-actions">
          <Button disabled={pending} onClick={onSave}>
            {text.save}
          </Button>
          <Button disabled={pending} onClick={onCancel}>
            {text.discard}
          </Button>
        </div>
      </div>
    </section>
  );
}
export function ApplicationRemoval({
  app,
  pending,
  onCancel,
  onConfirm,
}: {
  app: CatalogApp | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root
      open={app !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="v-backdrop" />
        <Dialog.Popup className="v-launcher-removal">
          <Dialog.Title>
            {app ? text.removeMessage(app.name) : text.remove}
          </Dialog.Title>
          <Dialog.Description>{text.confirmHelp}</Dialog.Description>
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

export function ApplicationArgumentReset({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <AlertDialog.Root open={open} onOpenChange={(value) => {if(!value) onCancel();}}><AlertDialog.Portal><AlertDialog.Backdrop className="v-backdrop" /><AlertDialog.Popup className="v-dialog"><AlertDialog.Title>{text.argumentResetTitle}</AlertDialog.Title><AlertDialog.Description>{text.argumentResetMessage}</AlertDialog.Description><div className="v-launcher-actions"><Button onClick={onCancel}>{text.cancel}</Button><Button variant="danger" onClick={onConfirm}>{text.confirmArgumentReset}</Button></div></AlertDialog.Popup></AlertDialog.Portal></AlertDialog.Root>;
}
