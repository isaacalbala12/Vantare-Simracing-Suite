import { useEffect, useState } from "react";

export type SaveDesignDialogProps = {
  open: boolean;
  onClose(): void;
  onSave(input: { name: string; includesContent: boolean }): void;
};

export function SaveDesignDialog(props: SaveDesignDialogProps): React.ReactElement | null {
  const { open, onClose, onSave } = props;
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
          Guardar diseño
        </h2>
        <p className="osv3-dialog-panel__body">
          Guarda solo apariencia y datos visuales resueltos. Nunca incluye layout, comportamiento, ID, sesión ni z-order.
        </p>
        <label className="osv3-design-dialog__field">
          <span className="osv3-design-dialog__label">Nombre</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="studio-save-design-name"
            className="osv3-design-dialog__input"
            placeholder="Mi diseño delta"
          />
        </label>
        <label className="osv3-design-dialog__checkbox">
          <input
            type="checkbox"
            checked={includesContent}
            onChange={(event) => setIncludesContent(event.target.checked)}
            data-testid="studio-save-design-include-content"
          />
          <span>Incluir contenido del widget</span>
        </label>
        {includesContent ? (
          <p className="osv3-dialog-panel__warning" data-testid="studio-save-design-content-warning">
            También se guardará la configuración de contenido actual del widget.
          </p>
        ) : null}
        <div className="osv3-dialog-panel__actions">
          <button
            type="button"
            data-testid="studio-save-design-cancel"
            className="osv3-dialog-panel__button"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="studio-save-design-confirm"
            className="osv3-dialog-panel__button osv3-dialog-panel__button--primary"
            disabled={!canSave}
            onClick={() => onSave({ name: trimmedName, includesContent })}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}