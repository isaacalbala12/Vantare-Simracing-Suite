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

function renderGap(row: StandingsRowViewModel) {
  const gap = resolveStandingsCellValue(row, "gap");
  const isPit = Boolean(row.pitText);
  return (
    <span className="vc-standings-gap-value">
      {row.tireCompound ? <span className={`vc-standings-tire-badge vc-tire-${row.tireCompound.toLowerCase()}`}>{row.tireCompound.slice(0, 1)}</span> : null}
      <span className={isPit ? "vc-standings-pit-tag" : undefined}>{isPit ? row.pitText : gap}</span>
    </span>
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
          <span>POS</span>
          <span>#</span>
          <span className="vc-standings-driver-heading">EQUIPO / PILOTO</span>
          <span>GAP</span>
          <span>LAST</span>
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
                style={{ "--vc-standings-class-color": classColor(row.vehicleClass) } as CSSProperties}
              >
                {classAbbreviation(row.vehicleClass)}
              </span>
              <span className="vc-standings-position">{row.position}</span>
              <span className="vc-standings-number">{row.driverNumber || "—"}</span>
              <span className="vc-standings-driver">{row.driverName}</span>
              {renderGap(row)}
              <span className="vc-standings-last">{row.lastLapText}</span>
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
