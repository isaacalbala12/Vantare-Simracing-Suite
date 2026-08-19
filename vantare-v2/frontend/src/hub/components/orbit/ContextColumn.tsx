import type { ReactNode } from "react";
import type { ViewId } from "../../orbit/views";

export interface ContextColumnBlock {
  id: "races" | "profile" | "launcher";
  /** Vistas que ya muestran ese contenido en su panel contextual. */
  hiddenFor: ViewId[];
  content: ReactNode;
}

/**
 * La columna no lleva pie (D-R3-B-1): el «LMU conectado / Free» de abajo era
 * ruido permanente en todas las vistas. El estado del sim se lee donde ya se
 * estaba mirando —el punto de color del saludo de Inicio y el pill de
 * Ajustes › Diagnóstico— y el plan se abre desde la fila de cuenta del rail.
 */
export interface ContextColumnProps {
  title: string;
  version: string;
  onCollapse(): void;
  context?: ReactNode;
  blocks: ContextColumnBlock[];
  activeView: ViewId;
  labels: { column: string; collapse: string };
  className?: string;
}

export function ContextColumn({
  title,
  version,
  onCollapse,
  context,
  blocks,
  activeView,
  labels,
  className,
}: ContextColumnProps) {
  // En Ajustes la columna muestra únicamente su contexto: los bloques
  // persistentes desaparecen enteros (`03-shell-y-layout.md § 3.3`).
  const visibleBlocks =
    activeView === "ajustes" ? [] : blocks.filter((block) => !block.hiddenFor.includes(activeView));

  return (
    <aside
      aria-label={labels.column}
      className={["orbit-column", className].filter(Boolean).join(" ")}
      data-view={activeView}
    >
      <div className="orbit-column__head">
        <strong className="orbit-column__title" data-testid="orbit-column-title">
          {title}
        </strong>
        <span className="orbit-column__version">
          <i aria-hidden="true" />
          {version}
        </span>
        <button
          aria-label={labels.collapse}
          className="orbit-column__collapse"
          data-testid="orbit-column-collapse"
          onClick={onCollapse}
          type="button"
        >
          ‹
        </button>
      </div>

      {context ? (
        <div className="orbit-column__context" data-testid="orbit-column-context">
          {context}
        </div>
      ) : null}

      {visibleBlocks.length > 0 ? (
        <div className="orbit-column__blocks" data-testid="orbit-column-blocks">
          {visibleBlocks.map((block) => (
            <div key={block.id} data-block={block.id}>
              {block.content}
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
