import { useI18n } from "../../i18n/I18nProvider";
import { formatHour, type AvailRange, type AvailState, type DriverView } from "./viz-types";

export interface AvailabilityBoardProps {
  drivers: DriverView[];
  ranges: Record<string, AvailRange[]>;
  /** Extremos del eje en horas decimales (13 → 18.5). */
  from: number;
  to: number;
  /** Etiqueta accesible; por defecto sale del catálogo i18n. */
  label?: string;
  className?: string;
}

const STATE_LABEL_KEY: Record<AvailState, string> = {
  ok: "orbit.avail.state.ok",
  maybe: "orbit.avail.state.maybe",
  no: "orbit.avail.state.no",
};

/**
 * Tablero de disponibilidad (`04 · .avail-*`): carriles de 22px con segmentos
 * `ok/maybe/no` sobre un eje horario.
 */
export function AvailabilityBoard({
  drivers,
  ranges,
  from,
  to,
  label,
  className,
}: AvailabilityBoardProps) {
  const { t } = useI18n();
  const boardLabel = label ?? t("orbit.avail.label");
  const span = to - from || 1;
  const ticks: number[] = [];
  for (let hour = Math.ceil(from); hour <= to; hour += 1) ticks.push(hour);

  return (
    <div
      aria-label={boardLabel}
      className={["orbit-avail", className].filter(Boolean).join(" ")}
      data-testid="orbit-availability-board"
      role="group"
    >
      <div className="orbit-avail__spacer" />
      <div className="orbit-avail__axis">
        {ticks.map((hour) => (
          <span key={hour} style={{ left: `${((hour - from) / span) * 100}%` }}>
            {formatHour(hour)}
          </span>
        ))}
      </div>
      {drivers.map((driver) => (
        <div className="orbit-avail__pair" key={driver.id}>
          <span className="orbit-avail__name">
            <i aria-hidden="true" style={{ background: driver.color }} />
            {driver.name}
          </span>
          <span className="orbit-avail__lane">
            {(ranges[driver.id] ?? []).map((range) => (
              <span
                aria-label={`${driver.name} · ${formatHour(range.from)}–${formatHour(range.to)} · ${t(STATE_LABEL_KEY[range.state])}`}
                className="orbit-avail__seg"
                data-state={range.state}
                data-testid="orbit-availability-cell"
                key={`${range.from}-${range.to}`}
                role="img"
                style={{
                  left: `${((range.from - from) / span) * 100}%`,
                  width: `${((range.to - range.from) / span) * 100}%`,
                }}
              />
            ))}
          </span>
        </div>
      ))}
      <ul className="orbit-avail__legend">
        {(["ok", "maybe", "no"] as AvailState[]).map((state) => (
          <li key={state}>
            <i aria-hidden="true" data-state={state} />
            {t(STATE_LABEL_KEY[state])}
          </li>
        ))}
      </ul>
    </div>
  );
}
