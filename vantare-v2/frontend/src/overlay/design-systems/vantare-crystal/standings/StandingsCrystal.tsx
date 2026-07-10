import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import { resolveColumnWidthPixels } from "../../../widget-types/shared/widget-column";
import { STANDINGS_COLUMN_TEMPLATES } from "../../../widget-types/standings/standings-content";
import {
  resolveStandingsCellValue,
  type StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";

function columnLabel(metricId: string): string {
  return (
    STANDINGS_COLUMN_TEMPLATES.find((template) => template.metricId === metricId)?.label ?? metricId
  );
}

function columnFallbackWidth(metricId: string): number {
  return (
    STANDINGS_COLUMN_TEMPLATES.find((template) => template.metricId === metricId)?.defaultWidth ?? 60
  );
}

export function StandingsCrystal({ model, settings }: WidgetRendererProps<StandingsViewModel>) {
  const showSessionHeader = settings.showSessionHeader !== false;
  const compactRows = settings.compactRows === true;

  return (
    <section
      data-widget-system="vantare-crystal"
      data-widget-renderer="standings"
      data-status={model.status}
      data-compact={compactRows ? "true" : undefined}
      className="vc-standings"
    >
      <div className="vc-standings-glow" aria-hidden="true" />
      <div className="vc-standings-frame">
        {showSessionHeader ? (
          <header className="vc-standings-meta">
            <span className="vc-standings-session">{model.sessionLabel}</span>
            <span className="vc-standings-remaining">{model.remainingText}</span>
          </header>
        ) : null}
        {model.statusMessage ? (
          <p className="vc-standings-status-message" role="status">
            {model.statusMessage}
          </p>
        ) : null}
        <div className="vc-standings-columns" role="row">
          {model.columns.map((column) => (
            <span
              key={column.id}
              className="vc-standings-column"
              data-metric={column.metricId}
              style={
                {
                  textAlign: column.style?.align ?? "center",
                  flexBasis: `${resolveColumnWidthPixels(column, columnFallbackWidth(column.metricId))}px`,
                } as CSSProperties
              }
            >
              {columnLabel(column.metricId)}
            </span>
          ))}
        </div>
        <div className="vc-standings-rows">
          {model.rows.map((row) => (
            <article
              key={row.id}
              data-standings-row={row.id}
              data-player={row.isPlayer ? "true" : undefined}
              data-leader={row.isLeader ? "true" : undefined}
              data-pit={row.pitText ? "true" : undefined}
              data-tire={row.tireCompound || undefined}
              className="vc-standings-row-card"
            >
              {model.columns.map((column) => (
                <span
                  key={column.id}
                  className="vc-standings-cell"
                  data-metric={column.metricId}
                  style={{ textAlign: column.style?.align ?? "center" }}
                >
                  {resolveStandingsCellValue(row, column.metricId)}
                </span>
              ))}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}