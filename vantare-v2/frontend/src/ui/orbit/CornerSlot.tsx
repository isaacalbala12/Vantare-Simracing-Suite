import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { TyreChip } from "./TyreChip";
import type { TyreView } from "./viz-types";

export interface CornerSlotProps {
  corner: "FL" | "FR" | "RL" | "RR";
  tyre?: TyreView;
  onDrop(id: string): void;
  onClear(): void;
  picked?: boolean;
  /**
   * Neumático elegido con «tocar-y-tocar». Con él, `Enter`/`Espacio` lo montan
   * en la esquina; sin él, vacían la esquina. Es la vía de teclado que pide
   * `08 · accesibilidad`, porque arrastrar no la tiene.
   */
  pickedId?: string;
  className?: string;
}

const CORNER_LABEL: Record<CornerSlotProps["corner"], string> = {
  FL: "delantera izquierda",
  FR: "delantera derecha",
  RL: "trasera izquierda",
  RR: "trasera derecha",
};

/** `07`: el halo verde de confirmación dura 500 ms. */
const PULSE_MS = 500;

/**
 * Esquina del esquema del coche (`04 · .corner-slot`): 64px punteado vacío,
 * sólido cuando está lleno, borde coral en `over`/foco y pulso al soltar.
 */
export function CornerSlot({ corner, tyre, onDrop, onClear, picked, pickedId, className }: CornerSlotProps) {
  const [over, setOver] = useState(false);
  const [pulse, setPulse] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const commit = (id: string) => {
    if (!id) return;
    onDrop(id);
    setPulse(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPulse(false), PULSE_MS);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    commit(event.dataTransfer.getData("text/plain"));
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (pickedId) {
      commit(pickedId);
      return;
    }
    if (tyre) onClear();
  };

  const state = tyre ? "filled" : "empty";

  return (
    <div
      aria-label={`Esquina ${CORNER_LABEL[corner]}${tyre ? `: ${tyre.id}` : ": vacía"}`}
      className={["orbit-corner-slot", className].filter(Boolean).join(" ")}
      data-over={over ? "true" : undefined}
      data-picked={picked ? "true" : undefined}
      data-pulse={pulse ? "true" : undefined}
      data-state={state}
      data-testid={`orbit-corner-slot-${corner}`}
      onDragLeave={() => setOver(false)}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }}
      onDrop={handleDrop}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
    >
      <span className="orbit-corner-slot__k">{corner}</span>
      {tyre ? (
        <>
          <TyreChip compound={tyre.compound} />
          <span className="orbit-corner-slot__id">{tyre.id}</span>
          <span className="orbit-corner-slot__cond">{tyre.condition} %</span>
          <button
            aria-label={`Quitar el neumático de ${CORNER_LABEL[corner]}`}
            className="orbit-corner-slot__x"
            onClick={(event) => { event.stopPropagation(); onClear(); }}
            type="button"
          >
            ×
          </button>
        </>
      ) : (
        <span className="orbit-corner-slot__empty">Arrastra un juego</span>
      )}
    </div>
  );
}
