import { useState, type DragEvent } from "react";
import { TyreChip } from "./TyreChip";
import { TYRE_WARN_USES, type TyreView } from "./viz-types";

export interface TyreItemProps {
  tyre: TyreView;
  used: { stint: number; corner: string }[];
  picked?: boolean;
  onPick(): void;
  className?: string;
}

/**
 * Fila del inventario de neumáticos (`04 · .tyre-item`): arrastrable, con
 * acento carmín cuando ya se usó y halo coral cuando está elegida.
 */
export function TyreItem({ tyre, used, picked, onPick, className }: TyreItemProps) {
  const [dragging, setDragging] = useState(false);
  const warn = used.length > TYRE_WARN_USES;
  const detail = used.length
    ? used.map((use) => `S${use.stint} ${use.corner}`).join(" · ")
    : (tyre.label ?? "Sin usar");

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.setData("text/plain", tyre.id);
    event.dataTransfer.effectAllowed = "move";
    setDragging(true);
  };

  return (
    <button
      aria-grabbed={dragging}
      aria-pressed={picked ?? false}
      className={["orbit-tyre-item", className].filter(Boolean).join(" ")}
      data-dragging={dragging ? "true" : undefined}
      data-testid={`orbit-tyre-item-${tyre.id}`}
      data-used={used.length ? "true" : undefined}
      draggable
      onClick={onPick}
      onDragEnd={() => setDragging(false)}
      onDragStart={handleDragStart}
      type="button"
    >
      <TyreChip compound={tyre.compound} />
      <span className="orbit-tyre-item__copy">
        <b>{tyre.id}</b>
        <span>{detail}</span>
      </span>
      <span className="orbit-tyre-item__cond" data-warn={warn ? "true" : undefined}>
        {tyre.condition} %
      </span>
    </button>
  );
}
