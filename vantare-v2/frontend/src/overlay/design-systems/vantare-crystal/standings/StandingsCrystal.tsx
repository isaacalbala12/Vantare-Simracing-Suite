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
  const enabledMetrics = new Set(model.columns.map((column) => column.metricId));
  const gapMetric = ["gap", "interval", "pit", "tireCompound"].find((metricId) =>
    enabledMetrics.has(metricId),
  );
  const lastMetric = ["lastLap", "bestLap", "currentLap"].find((metricId) =>
    enabledMetrics.has(metricId),
  );

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
        <div className="vc-standings-table-header" role="row">
          <span aria-hidden="true" />
          <span data-metric="position">POS</span>
          <span data-metric="driverNumber">#</span>
          <span className="vc-standings-driver-heading" data-metric="driverName">EQUIPO / PILOTO</span>
          <span data-metric={gapMetric}>{gapMetric === "interval" ? "INT" : gapMetric === "pit" ? "PIT" : "GAP"}</span>
          <span data-metric={lastMetric}>{lastMetric === "bestLap" ? "BEST" : lastMetric === "currentLap" ? "LAP" : "LAST"}</span>
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
              className="vc-standings-row"
            >
              <span
                className="vc-standings-class-bar"
                style={{ "--vc-standings-class-color": row.teamBrandColor || classColor(row.vehicleClass) } as CSSProperties}
              >
                {row.teamCode || teamAbbreviation(row.driverName) || classAbbreviation(row.vehicleClass)}
              </span>
              <span className="vc-standings-position" data-metric="position">{row.position}</span>
              <span className="vc-standings-number" data-metric="driverNumber">{row.driverNumber || "—"}</span>
              <span className="vc-standings-driver" data-metric="driverName">{row.driverName}</span>
              <span className="vc-standings-gap-value" data-metric={gapMetric}>
                {renderGap(row, gapMetric)}
              </span>
              <span className="vc-standings-last" data-metric={lastMetric}>
                {lastMetric ? resolveStandingsCellValue(row, lastMetric) : "—"}
              </span>
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
