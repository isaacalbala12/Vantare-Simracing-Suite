import { cloneElement, useState, type FocusEvent, type MouseEvent, type ReactElement } from "react";

export interface TooltipProps {
  text: string;
  side?: "right" | "top";
  children: ReactElement<{
    "data-tip"?: string;
    "data-tip-side"?: string;
    "data-tip-open"?: string;
    className?: string;
    onMouseEnter?: (event: MouseEvent) => void;
    onMouseLeave?: (event: MouseEvent) => void;
    onFocus?: (event: FocusEvent) => void;
    onBlur?: (event: FocusEvent) => void;
  }>;
}

/**
 * Tooltip propio del rail y del kit: **no** usa el `title` nativo (que solo
 * aparece con hover del ratón y con retardo). Se pinta con `::after` sobre
 * `data-tip`, así que es visible con hover **y** con foco de teclado
 * (`08-accesibilidad.md`). `data-tip-open` refleja ese estado en el DOM para
 * poder verificarlo desde los tests, donde los pseudoelementos no existen.
 */
export function Tooltip({ text, side = "right", children }: TooltipProps) {
  const [open, setOpen] = useState(false);

  return cloneElement(children, {
    "data-tip": text,
    "data-tip-side": side,
    "data-tip-open": open ? "true" : undefined,
    onMouseEnter: (event: MouseEvent) => {
      setOpen(true);
      children.props.onMouseEnter?.(event);
    },
    onMouseLeave: (event: MouseEvent) => {
      setOpen(false);
      children.props.onMouseLeave?.(event);
    },
    onFocus: (event: FocusEvent) => {
      setOpen(true);
      children.props.onFocus?.(event);
    },
    onBlur: (event: FocusEvent) => {
      setOpen(false);
      children.props.onBlur?.(event);
    },
  });
}
