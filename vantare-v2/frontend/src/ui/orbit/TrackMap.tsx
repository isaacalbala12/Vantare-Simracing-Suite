import { segmentTone } from "./viz-types";

export interface TrackSegment {
  id: string;
  /** Posición 0–1 dentro del trazado. */
  from: number;
  to: number;
  /** Delta en segundos: decide el color del tramo. */
  delta: number;
  label: string;
}

export interface TrackMapProps {
  path: [number, number][];
  segments: TrackSegment[];
  /** Posición del coche, 0–1. */
  cursor?: number;
  onSegment?(id: string): void;
  selected?: string;
  label?: string;
  className?: string;
}

function at(path: [number, number][], fraction: number): [number, number] {
  const index = Math.round(fraction * path.length);
  return path[((index % path.length) + path.length) % path.length];
}

function slice(path: [number, number][], from: number, to: number): [number, number][] {
  const count = path.length;
  const start = Math.round(from * count);
  const end = Math.round(to * count);
  const out: [number, number][] = [];
  for (let index = start; index <= end; index += 1) {
    out.push(path[((index % count) + count) % count]);
  }
  return out;
}

const pointsOf = (points: [number, number][]) => points.map((p) => p.join(",")).join(" ");

/**
 * Mapa de circuito (`04 · .tel-map`): polígono base, `polyline` por tramo
 * coloreada por delta, etiquetas de curva, línea de meta y punto de coche.
 */
export function TrackMap({
  path,
  segments,
  cursor,
  onSegment,
  selected,
  label = "Mapa de circuito",
  className,
}: TrackMapProps) {
  const xs = path.map((p) => p[0]);
  const ys = path.map((p) => p[1]);
  // El margen deja sitio al trazo de 15px y a las etiquetas de curva.
  const pad = 34;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) - minX + pad;
  const height = Math.max(...ys) - minY + pad;

  const sf = path[0];
  const sf2 = path[1] ?? path[0];
  const angle = Math.atan2(sf2[1] - sf[1], sf2[0] - sf[0]) + Math.PI / 2;
  const car = cursor === undefined ? null : at(path, cursor);

  return (
    <svg
      aria-label={label}
      className={["orbit-trackmap", className].filter(Boolean).join(" ")}
      role="img"
      viewBox={`${minX} ${minY} ${width} ${height}`}
    >
      <polygon className="orbit-trackmap__base" points={pointsOf(path)} />
      {segments.map((segment) => {
        const tone = segmentTone(segment.delta);
        const mid = at(path, (segment.from + segment.to) / 2);
        return (
          <g key={segment.id}>
            <polyline
              aria-label={`${segment.label} · ${segment.delta > 0 ? "+" : ""}${segment.delta.toFixed(2)} s`}
              className="orbit-trackmap__seg"
              data-on={selected === segment.id ? "true" : undefined}
              data-testid="orbit-trackmap-segment"
              data-tone={tone}
              onClick={onSegment ? () => onSegment(segment.id) : undefined}
              onKeyDown={
                onSegment
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSegment(segment.id);
                      }
                    }
                  : undefined
              }
              points={pointsOf(slice(path, segment.from, segment.to))}
              role={onSegment ? "button" : "img"}
              tabIndex={onSegment ? 0 : undefined}
            />
            <text className="orbit-trackmap__lbl" x={mid[0] + 10} y={mid[1] - 8}>
              {segment.label}
            </text>
          </g>
        );
      })}
      <line
        className="orbit-trackmap__sf"
        x1={sf[0] + Math.cos(angle) * 10}
        x2={sf[0] - Math.cos(angle) * 10}
        y1={sf[1] + Math.sin(angle) * 10}
        y2={sf[1] - Math.sin(angle) * 10}
      />
      {car ? (
        <circle
          className="orbit-trackmap__car"
          cx={car[0]}
          cy={car[1]}
          data-testid="orbit-trackmap-car"
          r={5}
        />
      ) : null}
    </svg>
  );
}
