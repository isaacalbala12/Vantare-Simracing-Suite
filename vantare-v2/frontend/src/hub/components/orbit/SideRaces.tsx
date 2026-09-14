import { useEffect, useState } from "react";
import { ListRow } from "../../../ui/orbit/ListRow";
import { formatMessage } from "../../orbit/format-message";
import { formatCountdown, formatStartTime } from "../../orbit/next-starts";
import type { RaceStart } from "../../orbit/race-starts";

/** Salidas que caben en el bloque persistente de la columna. */
const ROWS = 3;
/**
 * Cadencia del reloj (auditoría ISA-1111): a menos de 1 h la cuenta atrás se
 * lee en segundos ("mm:ss") y tickea cada 1 s; más lejos solo muestra "Nh Mm",
 * donde un tic de 30 s basta y la columna descansa entre renderizados.
 */
const TICK_NEAR_MS = 1_000;
const TICK_FAR_MS = 30_000;
const NEAR_WINDOW_MS = 60 * 60 * 1_000;

export interface SideRacesProps {
  /** Salidas reales del calendario del hub, ya ordenadas. */
  starts: RaceStart[];
  onSeeAll(): void;
  onSelect(seriesId: string): void;
  labels: { title: string; seeAll: string; in: string; empty: string };
  /** Inyectable en test para congelar el reloj. */
  now?: Date;
  className?: string;
}

/** Bloque persistente "Próximas carreras": 3 salidas con cuenta atrás adaptativa. */
export function SideRaces({
  starts,
  onSeeAll,
  onSelect,
  labels,
  now,
  className,
}: SideRacesProps) {
  const [tick, setTick] = useState(() => (now ?? new Date()).getTime());

  const reference = new Date(now ? now.getTime() : tick);
  const rows = starts.filter((start) => start.at.getTime() >= reference.getTime()).slice(0, ROWS);
  // La cadencia solo depende de la salida más próxima: un escalar en deps evita
  // rearmar el reloj cuando el padre recrea el array `starts` con igual contenido.
  const nextAt = rows[0]?.at.getTime();

  useEffect(() => {
    if (now) return;
    // setTimeout rearmado (no setInterval fijo): cada tic reevalúa la cadencia
    // con el reloj real, así el cruce del umbral de 1 h se detecta solo.
    let id: number | undefined;
    const arm = () => {
      const delay =
        nextAt !== undefined && nextAt - Date.now() < NEAR_WINDOW_MS
          ? TICK_NEAR_MS
          : TICK_FAR_MS;
      id = window.setTimeout(() => {
        setTick(Date.now());
        arm();
      }, delay);
    };
    arm();
    return () => window.clearTimeout(id);
  }, [now, nextAt]);

  return (
    <section aria-label={labels.title} className={["orbit-block", className].filter(Boolean).join(" ")}>
      <div className="orbit-block__head">
        <span className="orbit-eyebrow">{labels.title}</span>
        <button className="orbit-link" onClick={onSeeAll} type="button">
          {labels.seeAll}
        </button>
      </div>
      <div className="orbit-list" data-testid="orbit-side-races">
        {rows.length === 0 ? (
          <p className="orbit-row__copy">{labels.empty}</p>
        ) : (
          rows.map((row, index) => (
            <ListRow
              key={`${row.seriesId}-${row.at.getTime()}`}
              leading={<i aria-hidden="true" className="orbit-tier-dot" data-tier={row.tier} />}
              next={index === 0}
              onClick={() => onSelect(row.seriesId)}
              subtitle={row.track}
              title={row.name}
              trailing={
                <span className="orbit-when">
                  <b>{formatStartTime(row.at)}</b>
                  <span>
                    {formatMessage(labels.in, {
                      time: formatCountdown(row.at.getTime() - reference.getTime()),
                    })}
                  </span>
                </span>
              }
            />
          ))
        )}
      </div>
    </section>
  );
}
