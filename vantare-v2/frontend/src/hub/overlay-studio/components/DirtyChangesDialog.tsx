export type DirtyChangesDialogProps = {
  open: boolean;
  saving?: boolean;
  errorMessage?: string | null;
  onSave(): void;
  onDiscard(): void;
  onCancel(): void;
};

export function DirtyChangesDialog(props: DirtyChangesDialogProps): React.ReactElement | null {
  const { open, saving = false, errorMessage, onSave, onDiscard, onCancel } = props;
  if (!open) {
    return null;
  }

  return (
    <div
      className="osv3-dialog-backdrop"
      data-testid="studio-dirty-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-dirty-dialog-title"
    >
      <div className="osv3-dialog-panel">
        <h2 id="studio-dirty-dialog-title" className="osv3-dialog-panel__title">
          Cambios sin guardar
        </h2>
        <p className="osv3-dialog-panel__body">
          Tienes cambios pendientes. ¿Qué quieres hacer antes de salir?
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
            Guardar
          </button>
          <button
            type="button"
            data-testid="studio-dirty-discard"
            className="osv3-dialog-panel__button"
            disabled={saving}
            onClick={onDiscard}
          >
            Descartar
          </button>
          <button
            type="button"
            data-testid="studio-dirty-cancel"
            className="osv3-dialog-panel__button"
            disabled={saving}
            onClick={onCancel}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}