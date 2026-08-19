import { useEffect, useState } from "react";
import { ListRow } from "../../../ui/orbit/ListRow";
import { formatMessage } from "../../orbit/format-message";
import { formatCountdown, formatStartTime } from "../../orbit/next-starts";
import type { RaceStart } from "../../orbit/race-starts";

/** Salidas que caben en el bloque persistente de la columna. */
const ROWS = 3;

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

/** Bloque persistente "Próximas carreras": 3 salidas con cuenta atrás a 1 s. */
export function SideRaces({
  starts,
  onSeeAll,
  onSelect,
  labels,
  now,
  className,
}: SideRacesProps) {
  const [tick, setTick] = useState(() => (now ?? new Date()).getTime());

  useEffect(() => {
    if (now) return;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [now]);

  const reference = new Date(now ? now.getTime() : tick);
  const rows = starts.filter((start) => start.at.getTime() >= reference.getTime()).slice(0, ROWS);

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
