import { resolveColumnWidthPixels } from "../../../widget-types/shared/widget-column";
import { STANDINGS_COLUMN_TEMPLATES } from "../../../widget-types/standings/standings-content";
import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import { CrystalBrand, CrystalFooter, CrystalPill } from "../crystal-primitives";
import {
  resolveStandingsCellValue,
  type StandingsRowViewModel,
  type StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";

function classAbbreviation(vehicleClass: string): string {
  const normalized = vehicleClass.toUpperCase();
  if (normalized.includes("HYPER")) return "HC";
  if (normalized.includes("LMP2")) return "P2";
  if (normalized.includes("LMP3")) return "P3";
  if (normalized.includes("GT3")) return "GT3";
  return normalized.slice(0, 3) || "—";
}

function classColor(vehicleClass: string): string {
  const normalized = vehicleClass.toUpperCase();
  if (normalized.includes("HYPER")) return "#c1121f";
  if (normalized.includes("LMP2")) return "#0055a4";
  if (normalized.includes("LMP3")) return "#f59e0b";
  if (normalized.includes("GT3")) return "#2ecc71";
  return "#6b7280";
}

function teamAbbreviation(driverName: string): string {
  const words = driverName.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
  return driverName.slice(0, 2).toUpperCase() || "—";
}

function renderGap(row: StandingsRowViewModel, metricId: string | undefined) {
  const gap = metricId ? resolveStandingsCellValue(row, metricId) : "—";
  const isPit = Boolean(row.pitText);
  return (
    <>
      {row.tireCompound ? <span className={`vc-standings-tire-badge vc-tire-${row.tireCompound.toLowerCase()}`}>{row.tireCompound.slice(0, 1)}</span> : null}
      <span className={isPit ? "vc-standings-pit-tag" : undefined}>{isPit ? row.pitText : gap}</span>
    </>
  );
}

export function StandingsCrystal({ model, settings }: WidgetRendererProps<StandingsViewModel>) {
  const showSessionHeader = settings.showSessionHeader !== false;
  const compactRows = settings.compactRows === true;
  const gridTemplateColumns = ["20px", ...model.columns.map(column => {
    const fallback = STANDINGS_COLUMN_TEMPLATES.find(t => t.metricId === column.metricId)?.defaultWidth ?? 60;
    // Names need more room than numeric metrics at the same width preset.
    const weight = resolveColumnWidthPixels(column, fallback) * (column.metricId === "driverName" ? 1.5 : 1);
    return `minmax(0, ${weight}fr)`;
  })].join(" ");
  const headings: Record<string, string> = { position: "POS", driverNumber: "#", driverName: "EQUIPO / PILOTO", gap: "GAP", interval: "INT", lastLap: "LAST", bestLap: "BEST", currentLap: "LAP", vehicleClass: "CLASE", pit: "PIT", tireCompound: "NEUM." };
  const cellClasses: Record<string, string> = { position: "vc-standings-position", driverNumber: "vc-standings-number", driverName: "vc-standings-driver", gap: "vc-standings-gap-value", interval: "vc-standings-gap-value", lastLap: "vc-standings-last", bestLap: "vc-standings-last" };

  return (
    <section
      data-widget-system="vantare-crystal"
      data-widget-renderer="standings"
      data-status={model.status}
      data-compact={compactRows ? "true" : undefined}
      className="vc-standings"
    >
      <div className="vc-standings-frame">
        {showSessionHeader ? (
          <header className="vc-standings-header">
            <CrystalBrand>VANTARE</CrystalBrand>
            <div className="vc-standings-header-meta">
              <CrystalPill>{model.activeClass}</CrystalPill>
              <span className="vc-standings-remaining">{model.remainingText}</span>
            </div>
          </header>
        ) : null}
        {model.statusMessage ? (
          <p className="vc-standings-status-message" role="status">
            {model.statusMessage}
          </p>
        ) : null}
        <div className="vc-standings-table-header" role="row" style={{ gridTemplateColumns }}>
          <span aria-hidden="true" />
          {model.columns.map(column => <span key={column.id} data-metric={column.metricId} style={{ textAlign: column.style?.align ?? "center" }}>{headings[column.metricId]}</span>)}
        </div>
        <div className="vc-standings-rows">
          {model.rows.map((row) => (
            <article
              key={row.id}
              data-standings-row={row.id}
              style={{ gridTemplateColumns }}
              data-player={row.isPlayer ? "true" : undefined}
              data-leader={row.isLeader ? "true" : undefined}
              data-pit={row.pitText ? "true" : undefined}
              data-tire={row.tireCompound || undefined}
              className="vc-standings-row"
            >
              <span
                className="vc-standings-class-bar"
                style={{ "--vc-standings-class-color": row.teamBrandColor || classColor(row.vehicleClass) } as CSSProperties}
              >
                {row.teamCode || teamAbbreviation(row.driverName) || classAbbreviation(row.vehicleClass)}
              </span>
              {model.columns.map(column => (
                <span key={column.id} data-metric={column.metricId} className={cellClasses[column.metricId]} style={{ textAlign: column.style?.align ?? "center" }}>
                  {column.metricId === "gap" || column.metricId === "interval" ? renderGap(row, column.metricId) : resolveStandingsCellValue(row, column.metricId)}
                </span>
              ))}
            </article>
          ))}
        </div>
        <CrystalFooter>
          <span>LE MANS ULTIMATE</span>
          <span>TRACK TEMP: —</span>
        </CrystalFooter>
      </div>
    </section>
  );
}
