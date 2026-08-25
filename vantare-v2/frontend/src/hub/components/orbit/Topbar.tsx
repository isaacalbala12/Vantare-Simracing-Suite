import type { ReactNode } from "react";
import { Pill } from "../../../ui/orbit/Pill";
import type { UpdateState, ViewId } from "../../orbit/views";
import { UpdateNews, type UpdateNewsLabels } from "./UpdateNews";
import type { ReleaseNote } from "../../settings/release-notes";

export interface TopbarProps {
  view: ViewId;
  eyebrow: string;
  title: string;
  children?: ReactNode;
  update?: UpdateState;
  /** Copia ya resuelta del pill de actualización. */
  updateLabel?: string;
  onUpdate?(): void;
  /** Qué trae cada versión pendiente; se muestra al pasar el ratón por el pill. */
  updateNotes?: ReleaseNote[];
  /** Versiones pendientes en total, incluidas las que no se describen. */
  updateNotesTotal?: number;
  updateNewsLabels?: UpdateNewsLabels;
  className?: string;
}

/**
 * Topbar de Orbit: contexto de la vista a la izquierda y pill de actualización
 * a la derecha. Ni densidad ni estado de LMU viven aquí (§ 3.4): el estado del
 * sim es competencia exclusiva del pie de la columna.
 */
export function Topbar({
  view,
  eyebrow,
  title,
  children,
  update = "none",
  updateLabel,
  onUpdate,
  updateNotes,
  updateNotesTotal,
  updateNewsLabels,
  className,
}: TopbarProps) {
  const pill =
    update === "none" ? null : (
      <Pill
        dot={update === "installing" ? "gold" : "ring-gold"}
        onClick={onUpdate}
        pulse={update === "downloading"}
        state={update}
      >
        {updateLabel}
      </Pill>
    );
  return (
    <header
      className={["orbit-topbar", className].filter(Boolean).join(" ")}
      data-view={view}
    >
      <div className="orbit-topbar__tt">
        <span className="orbit-topbar__eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {children}
      <div className="orbit-topbar__right">
        {pill && updateNewsLabels && updateNotes?.length ? (
          <UpdateNews
            labels={updateNewsLabels}
            notes={updateNotes}
            total={updateNotesTotal ?? updateNotes.length}
          >
            {pill}
          </UpdateNews>
        ) : (
          pill
        )}
      </div>
    </header>
  );
}
