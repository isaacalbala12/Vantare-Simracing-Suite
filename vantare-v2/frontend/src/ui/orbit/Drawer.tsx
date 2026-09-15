import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { useModalFocus } from "./modal-focus";

export interface DrawerProps {
  open: boolean;
  /** Título de la cabecera; también rotula el diálogo. */
  title: string;
  /** Rótulo accesible del botón de cerrar (el kit no traduce). */
  closeLabel: string;
  onClose(): void;
  /** Acciones del pie (ghost + primario). Sin ellas el pie no se pinta. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/**
 * Cajón lateral derecho (480 px) del kit Orbit.
 *
 * Cabecera con título y cerrar, cuerpo con scroll interno y pie de acciones
 * sobre un velo oscurecido. Cierra con `Esc` y con clic fuera, atrapa el foco
 * mientras está abierto y lo devuelve al elemento que lo abrió (`08`). El
 * movimiento son 280 ms de `translateX` con el easing del sistema (`07`), a 0 s
 * bajo `prefers-reduced-motion`.
 */
export function Drawer({
  open,
  title,
  closeLabel,
  onClose,
  footer,
  children,
  className,
  "data-testid": testId,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(panelRef, open, onClose, { visibleOnly: true });

  if (!open) return null;

  return createPortal(
    <div className="orbit-drawer-layer" data-testid={testId}>
      {/* El velo es el que recibe el clic fuera: el panel vive fuera de él para
          no depender de que el evento no burbujee. */}
      <div
        aria-hidden="true"
        className="orbit-drawer__scrim"
        data-testid="orbit-drawer-scrim"
        onClick={onClose}
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={cx("orbit-drawer", className)}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="orbit-drawer__head">
          <h3 id={titleId}>{title}</h3>
          <button
            aria-label={closeLabel}
            className="orbit-icon-btn orbit-icon-btn--28"
            data-testid="orbit-drawer-close"
            data-tip={closeLabel}
            data-tip-side="left"
            onClick={onClose}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              focusable="false"
              height={14}
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth={1.6}
              viewBox="0 0 14 14"
              width={14}
            >
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </header>
        <div className="orbit-drawer__body">{children}</div>
        {footer ? <footer className="orbit-drawer__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
