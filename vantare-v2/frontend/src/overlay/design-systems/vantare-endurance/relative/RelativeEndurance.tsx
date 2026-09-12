import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import { resolveRelativeClassColor } from "../../../widget-types/relative/relative-renderer-helpers";
import type { RelativeViewModel } from "../../../widget-types/relative/relative-view-model";
import { parseRelativeEnduranceSettings } from "./relative-endurance-settings";
import {
  RelativeRedlineTemplate,
  type RelativeRedlineVariant,
} from "./RelativeRedlineTemplates";

const REDLINE_VARIANTS: Record<string, RelativeRedlineVariant> = {
  "relative-redline-mirror": "mirror",
  "relative-redline-proximity": "proximity",
  "relative-redline-traffic": "traffic",
};

function driverCode(driverName: string): string {
  const words = driverName
    .replace(/\(.*?\)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const lastWord = words[words.length - 1] ?? "";
  return (lastWord.length >= 3 ? lastWord : driverName.replace(/\s+/g, "")).slice(0, 3).toUpperCase();
}

function NeoTemplate({
  model,
  settings,
  showHeader,
}: {
  model: RelativeViewModel;
  settings: Readonly<Record<string, unknown>>;
  showHeader: boolean;
}) {
  return (
    <>
      {showHeader ? (
        <header className="ven-neo-header">
          <span className="ven-neo-brand">VANTARE</span>
          <span className="ven-neo-clock">
            <span className="ven-neo-clock-label">RELATIVE</span>
          </span>
        </header>
      ) : null}
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      <div className="ven-neo-card ven-neor-card">
        {model.rows.map((row) => (
          <div
            key={row.id}
            data-relative-row={row.id}
            data-player={row.isPlayer ? "true" : undefined}
            data-tone={row.tone}
            data-class={row.vehicleClass || undefined}
            className="ven-neo-row ven-neor-row"
            style={
              {
                "--neo-class": resolveRelativeClassColor(row.vehicleClass, settings),
              } as CSSProperties
            }
          >
            <span className="ven-neo-pos ven-neor-pos">{row.position}</span>
            <span className="ven-neo-id">
              <span className="ven-neo-code">{driverCode(row.driverName)}</span>
              <span className="ven-neo-name">{row.driverName}</span>
            </span>
            <span className="ven-neo-gap ven-neor-gap" data-tone={row.tone}>
              {row.isPlayer ? "YOU" : row.gapText}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export function RelativeEndurance({ model, settings }: WidgetRendererProps<RelativeViewModel>) {
  const parsed = parseRelativeEnduranceSettings(settings);

  const redlineVariant = REDLINE_VARIANTS[parsed.templateId];
  if (redlineVariant) {
    return (
      <section
        data-widget-system="vantare-endurance"
        data-widget-renderer="relative"
        data-status={model.status}
        data-template={parsed.templateId}
        data-row-height={model.rowHeightMode}
        className="ven-root ven-relative ven-rel"
      >
        <RelativeRedlineTemplate
          model={model}
          settings={settings}
          variant={redlineVariant}
          showHeader={parsed.showHeader}
        />
      </section>
    );
  }

  if (parsed.templateId === "relative-neo") {
    return (
      <section
        data-widget-system="vantare-endurance"
        data-widget-renderer="relative"
        data-status={model.status}
        data-template="relative-neo"
        data-row-height={model.rowHeightMode}
        className="ven-root ven-relative ven-neor"
      >
        <NeoTemplate model={model} settings={settings} showHeader={parsed.showHeader} />
      </section>
    );
  }

  const showHeader = parsed.templateId === "relative-classic" && parsed.showHeader;

  return (
    <section
      data-widget-system="vantare-endurance"
      data-widget-renderer="relative"
      data-status={model.status}
      data-template={parsed.templateId}
      data-row-height={model.rowHeightMode}
      className="ven-root ven-relative"
      style={{ width: "100%" }}
    >
      {showHeader ? (
        <header className="ven-titlebar">
          <span className="ven-brand">VANTARE</span>
          <span className="ven-title">RELATIVE</span>
        </header>
      ) : null}
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      <div className="ven-relative-rows">
        {model.rows.map((row, index) => (
          <div
            key={row.id}
            data-relative-row={row.id}
            data-player={row.isPlayer ? "true" : undefined}
            data-tone={row.tone}
            data-class={row.vehicleClass || undefined}
            data-even={index % 2 === 1 ? "true" : undefined}
            className="ven-relative-row"
            style={
              {
                "--ven-class-color": resolveRelativeClassColor(row.vehicleClass, settings),
              } as CSSProperties
            }
          >
            <span className="ven-pos-chip">{row.position}</span>
            <span className="ven-relative-number">{row.driverNumber}</span>
            <span className="ven-relative-name">{row.driverName}</span>
            <span className="ven-relative-gap" data-tone={row.tone}>
              {row.isPlayer ? "—" : row.gapText}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
