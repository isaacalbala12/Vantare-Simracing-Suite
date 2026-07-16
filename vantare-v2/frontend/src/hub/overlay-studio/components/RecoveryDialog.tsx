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
  const { t } = useI18n();
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
          {t("studio.v3.recovery.title")}
        </h2>
        <p className="osv3-dialog-panel__body">
          {t("studio.v3.recovery.bodyPrefix")} {" "}
          <strong data-testid="studio-recovery-profile">{profileName}</strong> guardado el{" "}
          {t("studio.v3.recovery.bodySavedOn")} <span data-testid="studio-recovery-time">{formatCapturedAt(capturedAt)}</span>.
        </p>
        {staleRevisionWarning ? (
          <p data-testid="studio-recovery-stale-warning" className="osv3-dialog-panel__warning" role="alert">
            {staleRevisionWarning ? t("studio.v3.recovery.staleWarning") : null}
          </p>
        ) : null}
        <div className="osv3-dialog-panel__actions">
          <button
            type="button"
            data-testid="studio-recovery-recover"
            className="osv3-dialog-panel__button osv3-dialog-panel__button--primary"
            onClick={onRecover}
          >
            {t("studio.v3.recovery.recover")}
          </button>
          <button
            type="button"
            data-testid="studio-recovery-discard"
            className="osv3-dialog-panel__button"
            onClick={onDiscard}
          >
            {t("studio.v3.recovery.discard")}
          </button>
        </div>
      </div>
    </div>
  );
}
import { useI18n } from "../../../i18n/I18nProvider";
