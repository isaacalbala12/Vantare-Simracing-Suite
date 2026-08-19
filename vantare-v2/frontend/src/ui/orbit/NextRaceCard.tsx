import { useEffect, useState } from "react";
import { Dot } from "./Dot";
import { IconButton } from "./IconButton";
import { formatCountdown } from "./viz-types";

export interface NextRaceCardProps {
  target: Date;
  /** Antetítulo con punto (`.focus-top`), p. ej. «Próxima serie». */
  eyebrow: string;
  title: string;
  meta: string;
  /** Prefijo del reloj (`04 · .timer`): «en 06:36». */
  prefix?: string;
  onOpen(): void;
  /** `aria-label` del botón circular que abre la serie. */
  openLabel: string;
  /** Reloj inyectable: sin él la tarjeta usa `Date.now()` y refresca cada segundo. */
  now?: Date;
  className?: string;
}

/**
 * Tarjeta de la próxima salida (`04 · .next-race`): superficie vino con
 * antetítulo con punto, nombre · circuito, reloj mono con prefijo, línea de
 * cadencia y el botón circular que abre la serie.
 *
 * Sustituye al antiguo `CountdownDial` (D-R4-2): el anillo de cuenta atrás se
 * retiró y solo queda la tarjeta, sin trazos alrededor. La cuenta atrás
 * conserva el tick de 1 s.
 */
export function NextRaceCard({
  target,
  eyebrow,
  title,
  meta,
  prefix,
  onOpen,
  openLabel,
  now,
  className,
}: NextRaceCardProps) {
  const [tick, setTick] = useState(() => now ?? new Date());

  useEffect(() => {
    if (now) return;
    const id = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(id);
  }, [now]);

  const clock = now ?? tick;
  const label = formatCountdown(target, clock);
  const clockLabel = prefix ? `${prefix} ${label}` : label;

  return (
    <article
      className={["orbit-next-race", className].filter(Boolean).join(" ")}
      data-testid="orbit-next-race"
    >
      <span className="orbit-next-race__eyebrow">
        <Dot />
        {eyebrow}
      </span>
      <strong className="orbit-next-race__title">{title}</strong>
      <div className="orbit-next-race__foot">
        <span className="orbit-next-race__clock">
          <span className="orbit-next-race__time">{clockLabel}</span>
          <small className="orbit-next-race__meta">{meta}</small>
        </span>
        <IconButton
          className="orbit-next-race__open"
          icon="i-chevron"
          label={openLabel}
          onClick={onOpen}
          size={28}
        />
      </div>
    </article>
  );
}
