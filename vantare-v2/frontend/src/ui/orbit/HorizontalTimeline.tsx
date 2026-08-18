import { Fragment, type ReactNode } from "react";

export interface TimelineBlock {
  id: string;
  start: Date;
  durationMin: number;
  color: string;
  label?: string;
  done?: boolean;
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
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Timeline horizontal (`04 · .tl-*`): rejilla `headWidth|1fr`, eje con ticks
 * mono, filas con líneas verticales y bloques absolutos en porcentaje del
 * `spanMin`. Scroll horizontal interno cuando se fija `minWidth`.
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
}: HorizontalTimelineProps<Row>) {
  const spanMs = spanMin * 60_000;
  const pct = (date: Date) => ((date.getTime() - start.getTime()) / spanMs) * 100;
  const tickCount = Math.floor(spanMin / tickEveryMin);
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const at = new Date(start.getTime() + index * tickEveryMin * 60_000);
    const left = (index * tickEveryMin * 100) / spanMin;
    return { at, left, last: left >= 100 };
  });
  const nowLeft = now ? pct(now) : null;

  return (
    <div
      aria-label={label}
      className={["orbit-tl", className].filter(Boolean).join(" ")}
      data-testid="orbit-timeline"
      role="group"
    >
      <div
        className="orbit-tl__inner"
        style={
          {
            "--orbit-tl-head": `${headWidth}px`,
            minWidth: minWidth ? `${minWidth}px` : undefined,
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
                const content = (
                  <>
                    {block.label}
                    {block.done ? <i aria-hidden="true">✓</i> : null}
                  </>
                );
                const style = {
                  left: `${left}%`,
                  width: `${width}%`,
                  background: block.color,
                } as React.CSSProperties;
                return onBlock ? (
                  <button
                    aria-pressed={selected === block.id}
                    className="orbit-tl__block"
                    data-done={block.done ? "true" : undefined}
                    data-testid="orbit-timeline-block"
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
                    data-done={block.done ? "true" : undefined}
                    data-testid="orbit-timeline-block"
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
