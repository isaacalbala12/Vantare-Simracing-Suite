import { useEffect, useId, useState } from "react";
import { dialFraction, formatCountdown } from "./viz-types";

export interface CountdownDialProps {
  target: Date;
  /** Ventana completa del dial en minutos (`13`: 180 por defecto). */
  intervalMin: number;
  title: string;
  meta: string;
  onOpen(): void;
  size?: 236 | 200;
  /** Reloj inyectable: sin él el dial usa `Date.now()` y refresca cada segundo. */
  now?: Date;
  className?: string;
}

/**
 * Dial de cuenta atrás (`04 · .dial`): SVG 320 rotado −90°, track, ticks, arco
 * con `pathLength=100` y punto coral que gira con la fracción. La tarjeta
 * interior es el disparador accesible.
 */
export function CountdownDial({
  target,
  intervalMin,
  title,
  meta,
  onOpen,
  size = 236,
  now,
  className,
}: CountdownDialProps) {
  const gradientId = useId().replace(/:/g, "");
  const [tick, setTick] = useState(() => now ?? new Date());

  useEffect(() => {
    if (now) return;
    const id = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(id);
  }, [now]);

  const clock = now ?? tick;
  const frac = dialFraction(target, intervalMin, clock);
  const label = formatCountdown(target, clock);

  return (
    <div
      className={["orbit-dial", className].filter(Boolean).join(" ")}
      data-frac={frac.toFixed(4)}
      data-size={size}
      style={{ "--orbit-dial-size": `${size}px` } as React.CSSProperties}
    >
      <svg
        aria-label={`Cuenta atrás hasta ${title}: ${label}`}
        className="orbit-dial__svg"
        role="img"
        viewBox="0 0 320 320"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--orbit-coral)" />
            <stop offset="1" stopColor="var(--orbit-carmine)" />
          </linearGradient>
        </defs>
        <circle className="orbit-dial__track" cx="160" cy="160" r="150" />
        <circle className="orbit-dial__ticks" cx="160" cy="160" r="141" />
        <circle
          className="orbit-dial__arc"
          cx="160"
          cy="160"
          data-testid="orbit-dial-arc"
          pathLength={100}
          r="150"
          stroke={`url(#${gradientId})`}
          strokeDashoffset={100 - frac * 100}
        />
        <circle
          className="orbit-dial__dot"
          cx="160"
          cy="10"
          data-testid="orbit-dial-dot"
          r="5"
          transform={`rotate(${(frac * 360).toFixed(2)} 160 160)`}
        />
      </svg>
      <button className="orbit-dial__card" onClick={onOpen} type="button">
        <span className="orbit-dial__title">{title}</span>
        <span className="orbit-dial__time">{label}</span>
        <span className="orbit-dial__meta">{meta}</span>
      </button>
    </div>
  );
}
