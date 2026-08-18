import { cloneElement, type ReactElement } from "react";

export interface TooltipProps {
  text: string;
  side?: "right" | "top";
  children: ReactElement<{ "data-tip"?: string; "data-tip-side"?: string; className?: string }>;
}

/**
 * Tooltip propio del rail: **no** usa el `title` nativo (que solo aparece con
 * hover del ratón y con retardo). Se pinta con `::after` sobre `data-tip`, así
 * que es visible con hover **y** con foco de teclado (`08-accesibilidad.md`).
 */
export function Tooltip({ text, side = "right", children }: TooltipProps) {
  return cloneElement(children, {
    "data-tip": text,
    "data-tip-side": side,
  });
}
