import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

export interface TimelineBlock {
  id: string;
  start: Date;
  durationMin: number;
  color: string;
  label?: string;
  done?: boolean;
  /**
   * Tinta del rótulo sobre `color`. `dark` (defecto) para fondos claros
   * (cian, ámbar, gris) y `light` para fondos oscuros (carmín): así el texto
   * mantiene contraste AA sin depender del color de cada consumidor.
   */
  ink?: "dark" | "light";
  /** Tooltip propio del kit (`data-tip`): el kit nunca usa `title` nativo. */
  tip?: string;
  /** Contorno discontinuo para superponer un plan alternativo sin ocultar el principal. */
  variant?: "solid" | "outline";
}

export interface HorizontalTimelineProps<Row> {
  rows: Row[];
  rowLabel(r: Row): ReactNode;
  start: Date;
  spanMin: number;
  tickEveryMin: number;
  blocks(r: Row): TimelineBlock[];
  now?: Date;
  onBlock?(id: string): void;
  selected?: string;
  minWidth?: number;
  /** Ancho de la columna de rótulos: 210 (Carreras) o 150 (Estrategia). */
  headWidth?: number;
  label?: string;
  className?: string;
  /**
   * Zoom del eje en píxeles por hora. Cuando se fija, el ancho del contenido
   * lo manda el zoom (`headWidth + spanMin/60 · pxPerHour`) y `minWidth` deja
   * de aplicarse. Sin él el componente se comporta como antes.
   */
  pxPerHour?: number;
  /** Límites del zoom para `ctrl+rueda` (el consumidor manda el rango real). */
  minPxPerHour?: number;
  maxPxPerHour?: number;
  /** `ctrl+rueda`: propone el nuevo `pxPerHour` ya recortado a los límites. */
  onZoom?(nextPxPerHour: number): void;
  /** Ancho útil del eje (viewport − rótulos) cada vez que cambia. */
  onAxisWidth?(px: number): void;
  /** Habilita arrastre horizontal y `shift+rueda` sobre el eje. */
  pan?: boolean;
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Timeline horizontal (`04 · .tl-*`): rejilla `headWidth|1fr`, eje con ticks
 * mono, filas con líneas verticales y bloques absolutos en porcentaje del
 * `spanMin`. Scroll horizontal interno cuando se fija `minWidth` o `pxPerHour`.
 *
 * El zoom es opcional y retrocompatible: sin `pxPerHour` no hay ni rueda ni
 * arrastre y el componente se dibuja exactamente como antes (Estrategia).
 */
export function HorizontalTimeline<Row>({
  rows,
  rowLabel,
  start,
  spanMin,
  tickEveryMin,
  blocks,
  now,
  onBlock,
  selected,
  minWidth,
  headWidth = 210,
  label = "Timeline",
  className,
  pxPerHour,
  minPxPerHour,
  maxPxPerHour,
  onZoom,
  onAxisWidth,
  pan,
}: HorizontalTimelineProps<Row>) {
  const spanMs = spanMin * 60_000;
  const pct = (date: Date) => ((date.getTime() - start.getTime()) / spanMs) * 100;
  const tickCount = Math.max(1, Math.floor(spanMin / tickEveryMin));
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const at = new Date(start.getTime() + index * tickEveryMin * 60_000);
    const left = (index * tickEveryMin * 100) / spanMin;
    return { at, left, last: left >= 100 };
  });
  const nowLeft = now ? pct(now) : null;

  const scroller = useRef<HTMLDivElement | null>(null);
  // Punto del cursor que el zoom debe mantener quieto: se guarda antes de
  // pedir el nuevo `pxPerHour` y se aplica cuando el ancho ya ha cambiado.
  const anchor = useRef<{ ratio: number; offset: number } | null>(null);
  const axisWidth = pxPerHour ? (spanMin / 60) * pxPerHour : null;

  const clamp = useCallback(
    (value: number) =>
      Math.min(maxPxPerHour ?? Number.POSITIVE_INFINITY, Math.max(minPxPerHour ?? 1, value)),
    [maxPxPerHour, minPxPerHour],
  );

  useLayoutEffect(() => {
    const node = scroller.current;
    const pending = anchor.current;
    anchor.current = null;
    if (!node || !pending || axisWidth === null) return;
    node.scrollLeft = pending.ratio * axisWidth + headWidth - pending.offset;
  }, [axisWidth, headWidth]);

  useEffect(() => {
    const node = scroller.current;
    if (!node || !onAxisWidth) return;
    const report = () => onAxisWidth(Math.max(0, node.clientWidth - headWidth));
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [headWidth, onAxisWidth]);

  // `wheel` va en nativo y no pasivo: React lo registra como pasivo y
  // `preventDefault` no llegaría a frenar el zoom del navegador.
  useEffect(() => {
    const node = scroller.current;
    if (!node || (!onZoom && !pan)) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.ctrlKey || event.metaKey) && onZoom && pxPerHour) {
        event.preventDefault();
        const offset = event.clientX - node.getBoundingClientRect().left;
        const width = (spanMin / 60) * pxPerHour;
        anchor.current = {
          ratio: width > 0 ? (node.scrollLeft + offset - headWidth) / width : 0,
          offset,
        };
        onZoom(clamp(pxPerHour * (event.deltaY < 0 ? 1.18 : 1 / 1.18)));
        return;
      }
      if (pan && event.shiftKey && event.deltaY !== 0) {
        event.preventDefault();
        node.scrollLeft += event.deltaY;
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [clamp, headWidth, onZoom, pan, pxPerHour, spanMin]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const node = scroller.current;
      if (!pan || !node || event.button !== 0) return;
      if ((event.target as HTMLElement).closest("button")) return;
      const startX = event.clientX;
      const startLeft = node.scrollLeft;
      node.dataset.panning = "true";
      const move = (moved: PointerEvent) => {
        node.scrollLeft = startLeft - (moved.clientX - startX);
      };
      const up = () => {
        delete node.dataset.panning;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [pan],
  );

  return (
    <div
      aria-label={label}
      className={["orbit-tl", pan ? "orbit-tl--pan" : null, className]
        .filter(Boolean)
        .join(" ")}
      data-testid="orbit-timeline"
      onPointerDown={pan ? onPointerDown : undefined}
      ref={scroller}
      role="group"
    >
      <div
        className="orbit-tl__inner"
        data-px-per-hour={pxPerHour ? String(Math.round(pxPerHour)) : undefined}
        style={
          {
            "--orbit-tl-head": `${headWidth}px`,
            width: axisWidth !== null ? `${headWidth + axisWidth}px` : undefined,
            minWidth: axisWidth === null && minWidth ? `${minWidth}px` : undefined,
          } as React.CSSProperties
        }
      >
        <div className="orbit-tl__corner" />
        <div className="orbit-tl__axis">
          {ticks.map((tick) => (
            <span
              className="orbit-tl__tick"
              data-last={tick.last ? "true" : undefined}
              key={tick.at.toISOString()}
              style={{ left: `${tick.left}%` }}
            >
              {hhmm(tick.at)}
            </span>
          ))}
        </div>
        {rows.map((row, index) => (
          <Fragment key={index}>
            <div className="orbit-tl__head">{rowLabel(row)}</div>
            <div
              className="orbit-tl__row"
              data-testid="orbit-timeline-row"
              style={{ "--orbit-tl-cells": tickCount } as React.CSSProperties}
            >
              {blocks(row).map((block) => {
                const left = pct(block.start);
                const width = (block.durationMin / spanMin) * 100;
                // El rótulo va en su propia caja recortable: sin ella el texto
                // se salía del bloque y los bloques vecinos lo tapaban a medias.
                const content = (
                  <>
                    {block.label ? (
                      <span
                        className="orbit-tl__block-label"
                        data-testid="orbit-timeline-block-label"
                      >
                        {block.label}
                      </span>
                    ) : null}
                    {block.done ? <i aria-hidden="true">✓</i> : null}
                  </>
                );
                const flags = {
                  "data-done": block.done ? "true" : undefined,
                  "data-ink": block.ink ?? "dark",
                  "data-label": block.label ? "true" : undefined,
                  "data-variant": block.variant === "outline" ? "outline" : undefined,
                };
                const style = {
                  left: `${left}%`,
                  width: `${width}%`,
                  background: block.color,
                } as React.CSSProperties;
                return onBlock ? (
                  <button
                    aria-pressed={selected === block.id}
                    className="orbit-tl__block"
                    {...flags}
                    data-testid="orbit-timeline-block"
                    data-tip={block.tip}
                    key={block.id}
                    onClick={() => onBlock(block.id)}
                    style={style}
                    type="button"
                  >
                    {content}
                  </button>
                ) : (
                  <span
                    className="orbit-tl__block"
                    {...flags}
                    data-testid="orbit-timeline-block"
                    data-tip={block.tip}
                    key={block.id}
                    style={style}
                  >
                    {content}
                  </span>
                );
              })}
              {nowLeft !== null && nowLeft >= 0 && nowLeft <= 100 ? (
                <span
                  aria-hidden="true"
                  className="orbit-tl__now"
                  data-testid="orbit-timeline-now"
                  style={{ left: `${nowLeft}%` }}
                />
              ) : null}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
