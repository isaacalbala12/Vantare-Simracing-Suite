import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { cx } from "./cx";
import { useModalFocus } from "./modal-focus";

export type ConfirmTone = "danger" | "primary";

export interface ConfirmDialogProps {
  open: boolean;
  /** Título del diálogo; también lo rotula. */
  title: string;
  /** Cuerpo de la pregunta: quien llama trae el texto ya traducido. */
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** `danger` pinta el botón de confirmar en rojo (borrados). */
  tone?: ConfirmTone;
  onCancel(): void;
  onConfirm(): void;
  className?: string;
  "data-testid"?: string;
}

/**
 * Diálogo de confirmación centrado del kit Orbit.
 *
 * Existe para que ninguna pantalla de la shell tenga que recurrir a
 * `window.confirm`, que bajo Wails se pinta como un cuadro del sistema con el
 * título «wails.localhost dice» y rompe el idioma y el lenguaje visual.
 *
 * Mismas reglas que el cajón (`Drawer`): velo, portal al final del `body`,
 * cierre con `Esc` y con clic fuera, foco atrapado mientras está abierto y
 * devuelto al elemento que lo abrió. El foco arranca en **Cancelar**: la
 * acción destructiva no debe dispararse con un `Enter` de inercia.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  onCancel,
  onConfirm,
  className,
  "data-testid": testId,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  // El primero del panel es Cancelar (ver el pie): el foco arranca ahí.
  useModalFocus(panelRef, open, onCancel, { escapePreventDefault: true });

  if (!open) return null;

  return createPortal(
    <div className="orbit-confirm-layer" data-testid={testId}>
      <div
        aria-hidden="true"
        className="orbit-confirm__scrim"
        data-testid="orbit-confirm-scrim"
        onClick={onCancel}
      />
      <div
        aria-describedby={bodyId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cx("orbit-confirm", className)}
        ref={panelRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <h3 className="orbit-confirm__title" id={titleId}>
          {title}
        </h3>
        <div className="orbit-confirm__body" id={bodyId}>
          {body}
        </div>
        <div className="orbit-confirm__acts">
          <Button
            data-testid="orbit-confirm-cancel"
            onClick={onCancel}
            type="button"
            variant="ghost"
          >
            {cancelLabel}
          </Button>
          <Button
            data-testid="orbit-confirm-accept"
            onClick={onConfirm}
            type="button"
            variant={tone === "danger" ? "danger" : "primary"}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
