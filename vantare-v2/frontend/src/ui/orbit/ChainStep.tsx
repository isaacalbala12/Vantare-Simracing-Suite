import type { ReactNode } from "react";
import { Monogram } from "./Monogram";

/** Estado por paso de una cadena de lanzamiento (`launcher-contract`). */
export type ChainStepStatus = "pending" | "launching" | "ready" | "failed";

export interface ChainStepProps {
  /** Abreviatura de la aplicación (monograma 26). */
  abbreviation: string;
  g1: string;
  g2: string;
  name: ReactNode;
  /** Espera del paso ya formateada («sin espera», «+2 s»). */
  wait: ReactNode;
  status?: ChainStepStatus;
  /** Texto del estado, si el paso ya no está pendiente. */
  statusLabel?: string;
  className?: string;
}

/**
 * Paso de una cadena (`04 · perfil de lanzamiento`).
 *
 * Monograma 26 + nombre + espera. El punto de unión con el paso siguiente lo
 * pinta el propio paso (`::after`) y toma color del estado: ámbar mientras
 * arranca, verde cuando está listo, rojo si falla.
 */
export function ChainStep({
  abbreviation,
  g1,
  g2,
  name,
  wait,
  status = "pending",
  statusLabel,
  className,
}: ChainStepProps) {
  return (
    <li
      className={["orbit-chain-step", className].filter(Boolean).join(" ")}
      data-s={status}
      data-testid="orbit-chain-step"
    >
      <Monogram g1={g1} g2={g2} size={26} text={abbreviation} />
      <b>{name}</b>
      <span>{statusLabel ?? wait}</span>
    </li>
  );
}

export interface ChainProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/** Contenedor de la cadena: pasos unidos por una línea, no por flechas. */
export function Chain({ label, children, className }: ChainProps) {
  return (
    <ol
      aria-label={label}
      className={["orbit-chain", className].filter(Boolean).join(" ")}
    >
      {children}
    </ol>
  );
}
