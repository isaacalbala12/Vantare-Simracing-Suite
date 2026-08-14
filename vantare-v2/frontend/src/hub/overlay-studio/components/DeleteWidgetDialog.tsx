import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider";

const MAX_LISTED_TARGETS = 5;

export type DeleteWidgetDialogProps = {
  open: boolean;
  widgetNames: readonly string[];
  onCancel(): void;
  onConfirm(dontAskAgain: boolean): void;
};

/**
 * La confirmacion de borrado del Studio.
 *
 * Antes era `window.confirm`, que en Wails se pinta como un cuadro del sistema
 * con el titulo "wails.localhost dice" y el texto de la clave i18n sin
 * traducir. Este dialogo vive en el mismo lenguaje visual que el resto del
 * Studio (osv3-dialog-*) y ademas puede decir que widget se va a perder, cosa
 * que el nativo no permitia.
 */
export function DeleteWidgetDialog(props: DeleteWidgetDialogProps): React.ReactElement | null {
  const { open, widgetNames, onCancel, onConfirm } = props;
  const { t } = useI18n();
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      setDontAskAgain(false);
      return;
    }
    // El foco arranca en Cancelar: la accion destructiva no debe dispararse
    // con un Enter de inercia despues de pulsar Eliminar.
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel, open]);

  if (!open) {
    return null;
  }

  const count = widgetNames.length;
  const listed = widgetNames.slice(0, MAX_LISTED_TARGETS);
  const remaining = count - listed.length;
  const body =
    count === 1
      ? t("studio.v3.deleteWidget.bodyOne").replace("{name}", widgetNames[0] ?? "")
      : t("studio.v3.deleteWidget.bodyMany").replace("{count}", String(count));

  return (
    <div
      className="osv3-dialog-backdrop osv3-dialog-backdrop--blur"
      data-testid="studio-delete-widget-dialog"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="osv3-dialog-panel osv3-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-delete-widget-title"
        aria-describedby="studio-delete-widget-body"
      >
        <div className="osv3-delete-dialog__head">
          <span className="osv3-delete-dialog__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 7h16" strokeLinecap="round" />
              <path d="M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7" strokeLinecap="round" />
              <path d="M6.4 7l.8 11.2A1.8 1.8 0 0 0 9 20h6a1.8 1.8 0 0 0 1.8-1.8L17.6 7" strokeLinecap="round" />
              <path d="M10.5 11v5M13.5 11v5" strokeLinecap="round" />
            </svg>
          </span>
          <h2 id="studio-delete-widget-title" className="osv3-dialog-panel__title osv3-delete-dialog__title">
            {t("studio.v3.deleteWidget.title")}
          </h2>
        </div>

        <p id="studio-delete-widget-body" className="osv3-dialog-panel__body osv3-delete-dialog__body">
          {body}
        </p>

        {count > 1 ? (
          <ul className="osv3-delete-dialog__targets">
            {listed.map((name, index) => (
              <li key={`${name}-${index}`} className="osv3-delete-dialog__target">
                {name}
              </li>
            ))}
            {remaining > 0 ? (
              <li className="osv3-delete-dialog__target osv3-delete-dialog__target--more">
                {t("studio.v3.deleteWidget.moreTargets").replace("{count}", String(remaining))}
              </li>
            ) : null}
          </ul>
        ) : null}

        <p className="osv3-delete-dialog__hint">{t("studio.v3.deleteWidget.hint")}</p>

        <label className="osv3-delete-dialog__remember">
          <input
            type="checkbox"
            data-testid="studio-delete-widget-dont-ask"
            checked={dontAskAgain}
            onChange={(event) => setDontAskAgain(event.target.checked)}
          />
          <span>{t("studio.v3.deleteWidget.dontAskAgain")}</span>
        </label>

        <div className="osv3-dialog-panel__actions">
          <button
            ref={cancelRef}
            type="button"
            data-testid="studio-delete-widget-cancel"
            className="osv3-dialog-panel__button"
            onClick={onCancel}
          >
            {t("studio.v3.deleteWidget.cancel")}
          </button>
          <button
            type="button"
            data-testid="studio-delete-widget-confirm"
            className="osv3-dialog-panel__button osv3-dialog-panel__button--danger"
            onClick={() => onConfirm(dontAskAgain)}
          >
            {t("studio.v3.deleteWidget.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
