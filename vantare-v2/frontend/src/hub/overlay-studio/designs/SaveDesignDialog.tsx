import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider";

export type SaveDesignDialogProps = {
  open: boolean;
  onClose(): void;
  onSave(input: { name: string; includesContent: boolean }): void;
};

export function SaveDesignDialog(props: SaveDesignDialogProps): React.ReactElement | null {
  const { open, onClose, onSave } = props;
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [includesContent, setIncludesContent] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setIncludesContent(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0;

  return (
    <div
      className="osv3-dialog-backdrop"
      data-testid="studio-save-design-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-save-design-dialog-title"
    >
      <div className="osv3-dialog-panel osv3-design-dialog">
        <h2 id="studio-save-design-dialog-title" className="osv3-dialog-panel__title">
          {t("studio.v3.design.saveDialog.title")}
        </h2>
        <p className="osv3-dialog-panel__body">
          {t("studio.v3.design.saveDialog.body")}
        </p>
        <label className="osv3-design-dialog__field">
          <span className="osv3-design-dialog__label">{t("studio.v3.design.saveDialog.nameLabel")}</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="studio-save-design-name"
            className="osv3-design-dialog__input"
            placeholder={t("studio.v3.design.saveDialog.namePlaceholder")}
          />
        </label>
        <label className="osv3-design-dialog__checkbox">
          <input
            type="checkbox"
            checked={includesContent}
            onChange={(event) => setIncludesContent(event.target.checked)}
            data-testid="studio-save-design-include-content"
          />
          <span>{t("studio.v3.design.saveDialog.includeContent")}</span>
        </label>
        {includesContent ? (
          <p className="osv3-dialog-panel__warning" data-testid="studio-save-design-content-warning">
            {t("studio.v3.design.saveDialog.includeContentWarning")}
          </p>
        ) : null}
        <div className="osv3-dialog-panel__actions">
          <button
            type="button"
            data-testid="studio-save-design-cancel"
            className="osv3-dialog-panel__button"
            onClick={onClose}
          >
            {t("studio.v3.design.saveDialog.cancel")}
          </button>
          <button
            type="button"
            data-testid="studio-save-design-confirm"
            className="osv3-dialog-panel__button osv3-dialog-panel__button--primary"
            disabled={!canSave}
            onClick={() => onSave({ name: trimmedName, includesContent })}
          >
            {t("studio.v3.design.saveDialog.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
