import { Kbd } from "./Kbd";

export interface KeycapRowProps {
  title: string;
  description: string;
  keys: string[];
  conflict?: boolean;
  empty?: boolean;
  className?: string;
}

/**
 * Fila de atajo (`04 · .hk-row` + keycap físico): copy a la izquierda y
 * keycaps físicos a la derecha; vacía en punteado y conflicto en ámbar.
 */
export function KeycapRow({ title, description, keys, conflict, empty, className }: KeycapRowProps) {
  return (
    <div
      className={["orbit-hk-row", className].filter(Boolean).join(" ")}
      data-conflict={conflict ? "true" : undefined}
      data-empty={empty ? "true" : undefined}
      data-testid="orbit-keycap-row"
    >
      <span className="orbit-hk-row__copy">
        <b>{title}</b>
        <span>{description}</span>
      </span>
      <Kbd
        conflict={conflict}
        empty={empty}
        keys={empty ? ["sin asignar"] : keys}
        physical
      />
      {conflict ? (
        <span className="orbit-hk-row__conflict" role="status">
          En conflicto
        </span>
      ) : null}
    </div>
  );
}
