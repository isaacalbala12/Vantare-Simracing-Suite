import { useEffect, useRef, useState } from "react";

const MAX_LISTED_TARGETS = 5;

export type StudioConfirmTone = "danger" | "primary";

export type StudioConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  /** Lista opcional de objetos afectados, cuando el cuerpo no puede nombrarlos todos. */
  targets?: readonly string[];
  moreTargetsLabel?: string;
  hint?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: StudioConfirmTone;
  /** Si viene, se pinta la casilla de "no volver a preguntar". */
  rememberLabel?: string;
  testIdPrefix: string;
  onCancel(): void;
  onConfirm(dontAskAgain: boolean): void;
};

/**
 * El dialogo de confirmacion del Studio.
 *
 * Antes cada una de estas preguntas era un `window.confirm`, que en Wails se
 * pinta como un cuadro del sistema con el titulo "wails.localhost dice" y, en
 * algun camino, con la clave i18n sin resolver. Este vive en el mismo lenguaje
 * visual que el resto del Studio (osv3-dialog-*) y ademas puede nombrar lo que
 * esta en juego, cosa que el nativo no permitia.
 *
 * No sabe de widgets ni de disenos: quien llama trae los textos ya resueltos.
 */
export function StudioConfirmDialog(props: StudioConfirmDialogProps): React.ReactElement | null {
  const {
    open,
    title,
    body,
    targets = [],
    moreTargetsLabel,
    hint,
    confirmLabel,
    cancelLabel,
    tone = "danger",
    rememberLabel,
    testIdPrefix,
    onCancel,
    onConfirm,
  } = props;
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      setDontAskAgain(false);
      return;
    }
    // El foco arranca en Cancelar: la accion no debe dispararse con un Enter
    // de inercia despues de pulsar el boton que abrio el dialogo.
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

  const listed = targets.slice(0, MAX_LISTED_TARGETS);
  const remaining = targets.length - listed.length;

  return (
    <div
      className="osv3-dialog-backdrop osv3-dialog-backdrop--blur"
      data-testid={`${testIdPrefix}-dialog`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className={`osv3-dialog-panel osv3-confirm-dialog osv3-confirm-dialog--${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testIdPrefix}-title`}
        aria-describedby={`${testIdPrefix}-body`}
      >
        <div className="osv3-confirm-dialog__head">
          <span className="osv3-confirm-dialog__mark" aria-hidden="true">
            {tone === "danger" ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 7h16" strokeLinecap="round" />
                <path d="M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7" strokeLinecap="round" />
                <path d="M6.4 7l.8 11.2A1.8 1.8 0 0 0 9 20h6a1.8 1.8 0 0 0 1.8-1.8L17.6 7" strokeLinecap="round" />
                <path d="M10.5 11v5M13.5 11v5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M12 3.5l8 4.2-8 4.2-8-4.2 8-4.2Z" strokeLinejoin="round" />
                <path d="M4 12.4l8 4.2 8-4.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 16.6l8 4.2 8-4.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <h2 id={`${testIdPrefix}-title`} className="osv3-dialog-panel__title osv3-confirm-dialog__title">
            {title}
          </h2>
        </div>

        <p id={`${testIdPrefix}-body`} className="osv3-dialog-panel__body osv3-confirm-dialog__body">
          {body}
        </p>

        {listed.length > 0 ? (
          <ul className="osv3-confirm-dialog__targets">
            {listed.map((name, index) => (
              <li key={`${name}-${index}`} className="osv3-confirm-dialog__target">
                {name}
              </li>
            ))}
            {remaining > 0 && moreTargetsLabel ? (
              <li className="osv3-confirm-dialog__target osv3-confirm-dialog__target--more">
                {moreTargetsLabel}
              </li>
            ) : null}
          </ul>
        ) : null}

        {hint ? <p className="osv3-confirm-dialog__hint">{hint}</p> : null}

        {rememberLabel ? (
          <label className="osv3-confirm-dialog__remember">
            <input
              type="checkbox"
              data-testid={`${testIdPrefix}-dont-ask`}
              checked={dontAskAgain}
              onChange={(event) => setDontAskAgain(event.target.checked)}
            />
            <span>{rememberLabel}</span>
          </label>
        ) : null}

        <div className="osv3-dialog-panel__actions">
          <button
            ref={cancelRef}
            type="button"
            data-testid={`${testIdPrefix}-cancel`}
            className="osv3-dialog-panel__button"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid={`${testIdPrefix}-confirm`}
            className={
              tone === "danger"
                ? "osv3-dialog-panel__button osv3-dialog-panel__button--danger"
                : "osv3-dialog-panel__button osv3-dialog-panel__button--primary"
            }
            onClick={() => onConfirm(dontAskAgain)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
