import type { CSSProperties } from "react";
import type { StandingsViewModel } from "../../../widget-types/standings/standings-view-model";
import { groupRowsByClass } from "./standings-endurance-shared";

/** LMU in-sim class palette sampled from the reference capture. */
const LMU_CLASS_COLORS: Record<string, { chip: string; tint: string; tintText: string }> = {
  HYPERCAR: { chip: "#c22743", tint: "#f2ccd4", tintText: "#5a0f1e" },
  LMP2: { chip: "#0b5097", tint: "#c3deef", tintText: "#083258" },
  LMP3: { chip: "#4a2258", tint: "#e5dae8", tintText: "#331540" },
  GT3: { chip: "#169745", tint: "#aee2c3", tintText: "#0b4d24" },
};

function lmuColors(vehicleClass: string) {
  return LMU_CLASS_COLORS[vehicleClass.toUpperCase()] ?? LMU_CLASS_COLORS.HYPERCAR;
}

function shortClassLabel(vehicleClass: string): string {
  const upper = vehicleClass.toUpperCase();
  if (upper.startsWith("LMP")) {
    return `P${upper.slice(3)}`;
  }
  if (upper === "HYPERCAR") {
    return "HY";
  }
  return upper.slice(0, 3);
}

function initialSurname(driverName: string): string {
  const words = driverName
    .replace(/\(.*?\)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) {
    return driverName;
  }
  return `${words[0]![0]} ${words.slice(1).join(" ")}`;
}

function formatLmuGap(gapText: string): string {
  const value = Number.parseFloat(gapText.replace(/[^\d.-]/g, ""));
  return Number.isFinite(value) ? `+${value.toFixed(1)}` : gapText;
}

/** LMU look: translucent near-black rows, class chip + light class tag, grey player row with dark text. */
export function StandingsLmuTemplate({
  model,
  showSessionHeader,
}: {
  model: StandingsViewModel;
  settings: Readonly<Record<string, unknown>>;
  showSessionHeader: boolean;
}) {
  return (
    <>
      {showSessionHeader ? (
        <header className="ven-lmu-header">
          <span className="ven-lmu-title">Standings</span>
          <span className="ven-lmu-meta">{model.remainingText}</span>
        </header>
      ) : null}
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      {groupRowsByClass(model.rows).map((group) => {
        const colors = lmuColors(group.vehicleClass);
        return (
          <div
            key={group.vehicleClass || "all"}
            className="ven-lmu-block"
            data-class-block={group.vehicleClass || "—"}
          >
            {group.rows.map((row, index) => (
              <div
                key={row.id}
                data-standings-row={row.id}
                data-player={row.isPlayer ? "true" : undefined}
                data-class={row.vehicleClass || undefined}
                data-pit={row.pitText ? "true" : undefined}
                className="ven-lmu-row"
                style={
                  {
                    "--lmu-chip": colors.chip,
                    "--lmu-tint": colors.tint,
                    "--lmu-tint-text": colors.tintText,
                  } as CSSProperties
                }
              >
                <span className="ven-lmu-pos">{index + 1}</span>
                <span className="ven-lmu-class">{shortClassLabel(row.vehicleClass)}</span>
                <span className="ven-lmu-name">{initialSurname(row.driverName)}</span>
                <span className="ven-lmu-gap">
                  {row.pitText ? row.pitText : index === 0 ? "—" : formatLmuGap(row.gapText)}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
