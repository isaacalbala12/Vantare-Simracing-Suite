import type { ReactNode } from "react";
import { Kbd } from "./Kbd";

export interface KeycapRowProps {
  title: string;
  description: string;
  keys: string[];
  conflict?: boolean;
  empty?: boolean;
  /** Rótulo del keycap punteado. El kit no traduce: lo pone quien lo usa. */
  emptyLabel?: string;
  /** Rótulo del aviso de conflicto. */
  conflictLabel?: string;
  /** Acción de la fila (grabar la combinación). Sin ella la fila no es un botón. */
  onRecord?(): void;
  /** Mientras se escucha el teclado, la fila lo dice en lugar de los keycaps. */
  recording?: boolean;
  recordingLabel?: string;
  trailing?: ReactNode;
  className?: string;
}

/**
 * Fila de atajo (`04 · .hk-row` + keycap físico): copy a la izquierda y
 * keycaps físicos a la derecha; vacía en punteado y conflicto en ámbar.
 */
export function KeycapRow({
  title,
  description,
  keys,
  conflict,
  empty,
  emptyLabel = "sin asignar",
  conflictLabel = "En conflicto",
  onRecord,
  recording,
  recordingLabel,
  trailing,
  className,
}: KeycapRowProps) {
  const body = (
    <>
      <span className="orbit-hk-row__copy">
        <b>{title}</b>
        <span>{description}</span>
      </span>
      {recording ? (
        <span className="orbit-hk-row__recording" role="status">
          {recordingLabel ?? "…"}
        </span>
      ) : (
        <Kbd conflict={conflict} empty={empty} keys={empty ? [emptyLabel] : keys} physical />
      )}
      {conflict ? (
        <span className="orbit-hk-row__conflict" role="status">
          {conflictLabel}
        </span>
      ) : null}
      {trailing}
    </>
  );

  const classes = ["orbit-hk-row", className].filter(Boolean).join(" ");
  const flags = {
    "data-conflict": conflict ? "true" : undefined,
    "data-empty": empty ? "true" : undefined,
    "data-recording": recording ? "true" : undefined,
    "data-testid": "orbit-keycap-row",
  } as const;

  if (!onRecord) {
    return (
      <div className={classes} {...flags}>
        {body}
      </div>
    );
  }

  return (
    <button className={`${classes} orbit-hk-row--action`} onClick={onRecord} type="button" {...flags}>
      {body}
    </button>
  );
}
