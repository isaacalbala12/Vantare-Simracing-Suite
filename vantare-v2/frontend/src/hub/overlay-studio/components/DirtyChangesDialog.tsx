export type DirtyChangesDialogProps = {
  open: boolean;
  saving?: boolean;
  errorMessage?: string | null;
  title?: string;
  body?: string;
  showDiscard?: boolean;
  dialogTestId?: string;
  onSave(): void;
  onDiscard?(): void;
  onCancel(): void;
};

export function DirtyChangesDialog(props: DirtyChangesDialogProps): React.ReactElement | null {
  const {
    open,
    saving = false,
    errorMessage,
    title,
    body,
    showDiscard = true,
    dialogTestId = "studio-dirty-dialog",
    onSave,
    onDiscard,
    onCancel,
  } = props;
  const { t } = useI18n();
  if (!open) {
    return null;
  }

  return (
    <div
      className="osv3-dialog-backdrop"
      data-testid={dialogTestId}
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-dirty-dialog-title"
    >
      <div className="osv3-dialog-panel">
        <h2 id="studio-dirty-dialog-title" className="osv3-dialog-panel__title">
          {title ?? t("studio.v3.dirtyDialog.title")}
        </h2>
        <p className="osv3-dialog-panel__body">
          {body ?? t("studio.v3.dirtyDialog.body")}
        </p>
        {errorMessage ? (
          <p data-testid="studio-dirty-error" className="osv3-dialog-panel__error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="osv3-dialog-panel__actions">
          <button
            type="button"
            data-testid="studio-dirty-save"
            className="osv3-dialog-panel__button osv3-dialog-panel__button--primary"
            disabled={saving}
            onClick={onSave}
          >
            {t("studio.v3.dirtyDialog.save")}
          </button>
          {showDiscard && onDiscard ? (
            <button
              type="button"
              data-testid="studio-dirty-discard"
              className="osv3-dialog-panel__button"
              disabled={saving}
              onClick={onDiscard}
            >
              {t("studio.v3.dirtyDialog.discard")}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="studio-dirty-cancel"
            className="osv3-dialog-panel__button"
            disabled={saving}
            onClick={onCancel}
          >
            {t("studio.v3.dirtyDialog.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
import { useI18n } from "../../../i18n/I18nProvider";
