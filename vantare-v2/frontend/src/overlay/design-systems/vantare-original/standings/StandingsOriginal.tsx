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

export function StandingsOriginal({ model, settings }: WidgetRendererProps<StandingsViewModel>) {
  const showSessionHeader = settings.showSessionHeader !== false;
  const compactRows = settings.compactRows === true;

  return (
    <section
      data-widget-system="vantare-original"
      data-widget-renderer="standings"
      data-status={model.status}
      data-compact={compactRows ? "true" : undefined}
      className="vo-standings"
    >
      {showSessionHeader ? (
        <header className="vo-standings-session">
          <span className="vo-standings-session-label">{model.sessionLabel}</span>
          <span className="vo-standings-remaining">{model.remainingText}</span>
        </header>
      ) : null}
      {model.statusMessage ? (
        <p className="vo-standings-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      <div className="vo-standings-table-wrap">
        <table className="vo-standings-table">
          <thead>
            <tr>
              {model.columns.map((column) => (
                <th
                  key={column.id}
                  data-metric={column.metricId}
                  style={
                    {
                      textAlign: column.style?.align ?? "center",
                      width: `${resolveColumnWidthPixels(column, columnFallbackWidth(column.metricId))}px`,
                    } as CSSProperties
                  }
                >
                  {columnLabel(column.metricId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row, index) => (
              <tr
                key={row.id}
                data-standings-row={row.id}
                data-player={row.isPlayer ? "true" : undefined}
                data-leader={row.isLeader ? "true" : undefined}
                data-pit={row.pitText ? "true" : undefined}
                data-tire={row.tireCompound || undefined}
                className={index % 2 === 1 ? "vo-standings-row-even" : undefined}
              >
                {model.columns.map((column) => (
                  <td
                    key={column.id}
                    data-metric={column.metricId}
                    style={{ textAlign: column.style?.align ?? "center" }}
                  >
                    {resolveStandingsCellValue(row, column.metricId)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}