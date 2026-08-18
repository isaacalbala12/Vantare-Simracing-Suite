import type { ReactNode } from "react";
import { Pill } from "../../../ui/orbit/Pill";
import type { SimStatus, ViewId } from "../../orbit/views";

export interface ContextColumnBlock {
  id: "races" | "profile" | "launcher";
  /** Vistas que ya muestran ese contenido en su panel contextual. */
  hiddenFor: ViewId[];
  content: ReactNode;
}

export interface ContextColumnProps {
  title: string;
  version: string;
  onCollapse(): void;
  context?: ReactNode;
  blocks: ContextColumnBlock[];
  activeView: ViewId;
  simStatus: SimStatus;
  planLabel: string;
  onOpenAccount(): void;
  labels: { column: string; collapse: string; sim: string; simTitle?: string };
  className?: string;
}

export function ContextColumn({
  title,
  version,
  onCollapse,
  context,
  blocks,
  activeView,
  simStatus,
  planLabel,
  onOpenAccount,
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

      <div className="orbit-column__foot">
        <Pill
          dot={simStatus === "connected" ? "ok" : simStatus === "searching" ? "ring-gold" : "ring"}
          pulse={simStatus === "searching"}
          state={simStatus}
          title={labels.simTitle}
        >
          {labels.sim}
        </Pill>
        <Pill onClick={onOpenAccount}>{planLabel}</Pill>
      </div>
    </aside>
  );
}
