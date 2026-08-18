export type TraceChannel = "speed" | "pedals" | "steer" | "delta";

export interface TraceBand {
  /** Posición 0–1 dentro de la vuelta. */
  at: number;
  label: string;
}

export interface TraceProps {
  channel: TraceChannel;
  mine: number[];
  /** Serie de referencia. Se llama `reference` y no `ref`: `ref` es un nombre
   *  reservado de React y el kit no puede exponerlo como dato. */
  reference?: number[];
  /** Segunda serie del canal (freno en `pedals`). */
  extra?: number[];
  bands?: TraceBand[];
  height: number;
  /** Rótulo del canal y unidad (`.trace-k`). */
  title?: string;
  unit?: string;
  /** Cursor vertical 0–1 (`.trace-cursor`). */
  cursor?: number;
  label?: string;
  className?: string;
}

const VIEW_W = 1000;
const PAD = 4;

function domainOf(channel: TraceChannel, series: number[][]): [number, number] {
  const values = series.flat();
  if (channel === "pedals") return [0, 100];
  if (values.length === 0) return [0, 1];
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (channel === "steer") {
    const bound = Math.max(Math.abs(max), Math.abs(min), 1);
    return [-bound, bound];
  }
  if (channel === "delta") {
    const bound = Math.max(Math.abs(max), Math.abs(min), 0.6) * 1.15;
    return [-bound, bound];
  }
  const pad = (max - min) * 0.08 || 1;
  return [min - pad, max + pad];
}

function points(data: number[], min: number, max: number, height: number): string {
  if (data.length < 2) return "";
  const span = max - min || 1;
  const inner = height - PAD * 2;
  return data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * VIEW_W;
      const y = PAD + inner * (1 - (value - min) / span);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function areaPoints(
  data: number[],
  min: number,
  max: number,
  height: number,
  side: "pos" | "neg",
): string {
  const zeroY = height / 2;
  const clamped = data.map((value) => (side === "pos" ? Math.max(0, value) : Math.min(0, value)));
  return `0,${zeroY} ${points(clamped, min, max, height)} ${VIEW_W},${zeroY}`;
}

/**
 * Traza (`04 · .trace-svg`): `viewBox 1000×h`, `preserveAspectRatio: none`,
 * bandas de curva, rejilla y líneas con `vector-effect: non-scaling-stroke`.
 * Los datos llegan ya calculados (`13`).
 */
export function Trace({
  channel,
  mine,
  reference,
  extra,
  bands,
  height,
  title,
  unit,
  cursor,
  label,
  className,
}: TraceProps) {
  const [min, max] = domainOf(channel, [mine, reference ?? [], extra ?? []]);
  const zeroY = height / 2;

  return (
    <div className={["orbit-trace", className].filter(Boolean).join(" ")} data-ch={channel}>
      {title ? (
        <div aria-hidden="true" className="orbit-trace__k">
          {title}
          {unit ? <em>{unit}</em> : null}
        </div>
      ) : null}
      <svg
        aria-label={label ?? `Traza de ${title ?? channel}`}
        className="orbit-trace__svg"
        data-ch={channel}
        preserveAspectRatio="none"
        role="img"
        style={{ height: `${height}px` }}
        viewBox={`0 0 ${VIEW_W} ${height}`}
      >
        {(bands ?? []).map((band) => (
          <g key={`${band.label}-${band.at}`}>
            <rect
              className="orbit-trace__band"
              height={height}
              width={60}
              x={(band.at * VIEW_W - 30).toFixed(0)}
              y={0}
            />
            <text className="orbit-trace__lbl" x={(band.at * VIEW_W - 28).toFixed(0)} y={14}>
              {band.label}
            </text>
          </g>
        ))}
        {channel === "speed" || channel === "pedals"
          ? [0.25, 0.5, 0.75].map((fraction) => (
              <line
                className="orbit-trace__grid"
                key={fraction}
                x1={0}
                x2={VIEW_W}
                y1={height * fraction}
                y2={height * fraction}
              />
            ))
          : null}
        {channel === "steer" || channel === "delta" ? (
          <line className="orbit-trace__zero" x1={0} x2={VIEW_W} y1={zeroY} y2={zeroY} />
        ) : null}
        {channel === "delta" ? (
          <>
            <polygon
              className="orbit-trace__delta-pos"
              points={areaPoints(mine, min, max, height, "pos")}
            />
            <polygon
              className="orbit-trace__delta-neg"
              points={areaPoints(mine, min, max, height, "neg")}
            />
            <polyline
              className="orbit-trace__delta-line"
              points={points(mine, min, max, height)}
            />
          </>
        ) : null}
        {channel === "pedals" ? (
          <>
            <polyline className="orbit-trace__thr" points={points(mine, min, max, height)} />
            {extra ? (
              <polyline className="orbit-trace__brk" points={points(extra, min, max, height)} />
            ) : null}
          </>
        ) : null}
        {channel === "speed" || channel === "steer" ? (
          <>
            {reference ? (
              <polyline
                className="orbit-trace__ref"
                points={points(reference, min, max, height)}
              />
            ) : null}
            <polyline className="orbit-trace__mine" points={points(mine, min, max, height)} />
          </>
        ) : null}
      </svg>
      {cursor === undefined ? null : (
        <span
          aria-hidden="true"
          className="orbit-trace__cursor"
          style={{ left: `${(cursor * 100).toFixed(2)}%` }}
        />
      )}
    </div>
  );
}
