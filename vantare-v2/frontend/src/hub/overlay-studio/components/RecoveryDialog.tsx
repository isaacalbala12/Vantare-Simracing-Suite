export type RecoveryDialogProps = {
  open: boolean;
  profileName: string;
  capturedAt: string;
  staleRevisionWarning?: string;
  onRecover(): void;
  onDiscard(): void;
};

function formatCapturedAt(capturedAt: string): string {
  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) {
    return capturedAt;
  }
  return date.toLocaleString();
}

export function RecoveryDialog(props: RecoveryDialogProps): React.ReactElement | null {
  const { open, profileName, capturedAt, staleRevisionWarning, onRecover, onDiscard } = props;
  if (!open) {
    return null;
  }

  return (
    <div
      className="osv3-dialog-backdrop"
      data-testid="studio-recovery-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-recovery-dialog-title"
    >
      <div className="osv3-dialog-panel">
        <h2 id="studio-recovery-dialog-title" className="osv3-dialog-panel__title">
          Borrador recuperable
        </h2>
        <p className="osv3-dialog-panel__body">
          Encontramos un borrador local para{" "}
          <strong data-testid="studio-recovery-profile">{profileName}</strong> guardado el{" "}
          <span data-testid="studio-recovery-time">{formatCapturedAt(capturedAt)}</span>.
        </p>
        {staleRevisionWarning ? (
          <p data-testid="studio-recovery-stale-warning" className="osv3-dialog-panel__warning" role="alert">
            La revisión del borrador no coincide con el archivo en disco. Revisa antes de recuperar.
          </p>
        ) : null}
        <div className="osv3-dialog-panel__actions">
          <button
            type="button"
            data-testid="studio-recovery-recover"
            className="osv3-dialog-panel__button osv3-dialog-panel__button--primary"
            onClick={onRecover}
          >
            Recuperar
          </button>
          <button
            type="button"
            data-testid="studio-recovery-discard"
            className="osv3-dialog-panel__button"
            onClick={onDiscard}
          >
            Descartar borrador
          </button>
        </div>
      </div>
    </div>
  );
}