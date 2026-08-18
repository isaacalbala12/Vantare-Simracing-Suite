export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface DonutProps {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  className?: string;
}

const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Hueco entre porciones, en unidades de perímetro (`04 · .donut`). */
const GAP = 3;

/**
 * Donut (`04 · .donut`): SVG 200, `r=80`, stroke 26, un `circle` por serie con
 * `stroke-dasharray` (len−3, resto) y `dashoffset` acumulado, rotado −90°.
 */
export function Donut({ slices, centerLabel, centerValue, className }: DonutProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  // Longitud y desplazamiento acumulado de cada porción, sin mutar en render.
  const arcs: { slice: DonutSlice; dash: number; offset: number }[] = [];
  slices.reduce((offset, slice) => {
    const length = total > 0 ? (slice.value / total) * CIRCUMFERENCE : 0;
    arcs.push({ slice, dash: Math.max(0, length - GAP), offset });
    return offset + length;
  }, 0);

  return (
    <div className={["orbit-donut-wrap", className].filter(Boolean).join(" ")}>
      <div className="orbit-donut-ring">
        <svg
          aria-label={`${centerLabel}: ${centerValue}. ${slices
            .map((slice) => `${slice.label} ${slice.value}`)
            .join(", ")}`}
          className="orbit-donut"
          role="img"
          viewBox="0 0 200 200"
        >
          <circle className="orbit-donut__track" cx="100" cy="100" r={RADIUS} />
          {arcs.map((arc) => (
            <circle
              cx="100"
              cy="100"
              data-slice={arc.slice.id}
              data-testid="orbit-donut-slice"
              key={arc.slice.id}
              r={RADIUS}
              stroke={arc.slice.color}
              strokeDasharray={`${arc.dash.toFixed(2)} ${(CIRCUMFERENCE - arc.dash).toFixed(2)}`}
              strokeDashoffset={(-arc.offset).toFixed(2)}
            />
          ))}
        </svg>
        <div aria-hidden="true" className="orbit-donut__center">
          <b>{centerLabel}</b>
          <span>{centerValue}</span>
        </div>
      </div>
      <ul className="orbit-donut__legend">
        {slices.map((slice) => (
          <li key={slice.id}>
            <i aria-hidden="true" style={{ background: slice.color }} />
            {slice.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
