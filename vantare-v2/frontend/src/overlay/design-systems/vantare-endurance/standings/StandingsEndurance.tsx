import type { CSSProperties } from "react";
import type { WidgetRendererProps } from "../../../core/design-system-definition";
import { resolveWidgetVisualGeometryForType } from "../../../core/widget-visual-geometry";
import { resolveColumnWidthPixels } from "../../../widget-types/shared/widget-column";
import { STANDINGS_COLUMN_TEMPLATES } from "../../../widget-types/standings/standings-content";
import {
  buildStandingsAppearanceStyle,
  resolveStandingsClassColor,
} from "../../../widget-types/standings/standings-renderer-helpers";
import {
  resolveStandingsCellValue,
  type StandingsRowViewModel,
  type StandingsViewModel,
} from "../../../widget-types/standings/standings-view-model";
import {
  driverCode,
  groupRowsByClass,
  tireLetter,
  type ClassGroup,
} from "./standings-endurance-shared";
import {
  parseStandingsEnduranceSettings,
  type StandingsEnduranceTemplateId,
} from "./standings-endurance-settings";
import { StandingsApexTemplate } from "./StandingsApexTemplate";
import { StandingsNeoTemplate } from "./StandingsNeoTemplate";
import { StandingsRedlineTemplate } from "./StandingsRedlineTemplate";
import { StandingsLmuTemplate } from "./StandingsLmuTemplate";
import { StandingsRacelabsTemplate } from "./StandingsRacelabsTemplate";
import { StandingsWecTemplate } from "./StandingsWecTemplate";
import { fitStandingsRowsToHeight } from "./standings-endurance-layout";

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

function StandingsRow({
  row,
  index,
  classPosition,
  columns,
  settings,
}: {
  row: StandingsRowViewModel;
  index: number;
  classPosition: number;
  columns: StandingsViewModel["columns"];
  settings: Readonly<Record<string, unknown>>;
}) {
  const classColor = resolveStandingsClassColor(row.vehicleClass, settings);
  return (
    <tr
      data-standings-row={row.id}
      data-player={row.isPlayer ? "true" : undefined}
      data-leader={row.isLeader ? "true" : undefined}
      data-pit={row.pitText ? "true" : undefined}
      data-class={row.vehicleClass || undefined}
      data-even={index % 2 === 1 ? "true" : undefined}
      className="ven-standings-row"
      style={{ "--ven-class-color": classColor } as CSSProperties}
    >
      {columns.map((column) => (
        <td
          key={column.id}
          data-metric={column.metricId}
          style={{ textAlign: column.style?.align ?? "center" }}
        >
          {column.metricId === "position" ? (
            <span className="ven-pos-chip">{classPosition}</span>
          ) : (
            resolveStandingsCellValue(row, column.metricId)
          )}
        </td>
      ))}
    </tr>
  );
}

function F1Rows({
  group,
  settings,
}: {
  group: ClassGroup;
  settings: Readonly<Record<string, unknown>>;
}) {
  return (
    <div className="ven-f1-rows">
      {group.rows.map((row, index) => {
        const rawGap = row.intervalText !== "—" ? row.intervalText : row.gapText;
        const gapValue = Number.parseFloat(rawGap.replace(/[^\d.-]/g, ""));
        const interval =
          index === 0
            ? "Interval"
            : Number.isFinite(gapValue)
              ? `+${gapValue.toFixed(1)}`
              : rawGap;
        return (
          <div
            key={row.id}
            data-standings-row={row.id}
            data-player={row.isPlayer ? "true" : undefined}
            data-class={row.vehicleClass || undefined}
            data-class-leader={index === 0 ? "true" : undefined}
            data-pit={row.pitText ? "true" : undefined}
            className="ven-f1-row"
            style={
              {
                "--ven-class-color": row.teamBrandColor || resolveStandingsClassColor(row.vehicleClass, settings),
              } as CSSProperties
            }
          >
            <span className="ven-f1-pos">{index + 1}</span>
            <span className="ven-f1-team" aria-hidden="true" />
            <span className="ven-f1-code">{driverCode(row.driverName)}</span>
            <span className="ven-f1-gap">{row.pitText ? row.pitText : interval}</span>
            <span className="ven-f1-tire" data-tire={tireLetter(row.tireCompound) || undefined}>
              {tireLetter(row.tireCompound)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function F1Template({
  model,
  settings,
  showSessionHeader,
}: {
  model: StandingsViewModel;
  settings: Readonly<Record<string, unknown>>;
  showSessionHeader: boolean;
}) {
  return (
    <>
      {showSessionHeader ? (
        <header className="ven-f1-header">
          <span className="ven-brand">VANTARE</span>
          <span className="ven-f1-session">
            {model.sessionLabel} <strong>{model.remainingText}</strong>
          </span>
        </header>
      ) : null}
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      {groupRowsByClass(model.rows).map((group) => (
        <div
          key={group.vehicleClass || "all"}
          className="ven-f1-block"
          data-class-block={group.vehicleClass || "—"}
        >
          {group.vehicleClass ? (
            <div
              className="ven-class-header ven-f1-class-header"
              data-class-header={group.vehicleClass}
              style={
                {
                  "--ven-class-color": resolveStandingsClassColor(group.vehicleClass, settings),
                } as CSSProperties
              }
            >
              <span className="ven-class-name">{group.vehicleClass}</span>
              <span className="ven-class-count">{group.rows.length}</span>
            </div>
          ) : null}
          <F1Rows group={group} settings={settings} />
        </div>
      ))}
    </>
  );
}

function TableTemplate({
  model,
  settings,
  showSessionHeader,
  isTower,
}: {
  model: StandingsViewModel;
  settings: Readonly<Record<string, unknown>>;
  showSessionHeader: boolean;
  isTower: boolean;
}) {
  const groups = isTower
    ? groupRowsByClass(model.rows)
    : [{ vehicleClass: "", rows: [...model.rows] }];

  return (
    <>
      {showSessionHeader ? (
        <header className="ven-titlebar">
          <span className="ven-brand">VANTARE</span>
          <span className="ven-title">{model.sessionLabel}</span>
          <span className="ven-titlebar-meta">{model.remainingText}</span>
        </header>
      ) : null}
      {model.statusMessage ? (
        <p className="ven-status-message" role="status">
          {model.statusMessage}
        </p>
      ) : null}
      {groups.map((group) => (
        <table
          key={group.vehicleClass || "all"}
          className="ven-class-block"
          data-class-block={isTower ? group.vehicleClass || "—" : undefined}
        >
          <thead>
            {isTower && group.vehicleClass ? (
              <tr
                className="ven-class-header"
                data-class-header={group.vehicleClass}
                style={
                  {
                    "--ven-class-color": resolveStandingsClassColor(
                      group.vehicleClass,
                      settings,
                    ),
                  } as CSSProperties
                }
              >
                <td colSpan={model.columns.length}>
                  <span className="ven-class-name">{group.vehicleClass}</span>
                  <span className="ven-class-count">{group.rows.length}</span>
                </td>
              </tr>
            ) : null}
            <tr className="ven-standings-head">
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
            {group.rows.map((row, index) => (
              <StandingsRow
                key={row.id}
                row={row}
                index={index}
                classPosition={isTower ? index + 1 : row.position}
                columns={model.columns}
                settings={settings}
              />
            ))}
          </tbody>
        </table>
      ))}
    </>
  );
}

function templateBody(
  templateId: StandingsEnduranceTemplateId,
  model: StandingsViewModel,
  settings: Readonly<Record<string, unknown>>,
  showSessionHeader: boolean,
) {
  switch (templateId) {
    case "standings-f1":
      return <F1Template model={model} settings={settings} showSessionHeader={showSessionHeader} />;
    case "standings-wec":
      return (
        <StandingsWecTemplate model={model} settings={settings} showSessionHeader={showSessionHeader} />
      );
    case "standings-lmu":
      return (
        <StandingsLmuTemplate model={model} settings={settings} showSessionHeader={showSessionHeader} />
      );
    case "standings-racelabs":
      return (
        <StandingsRacelabsTemplate
          model={model}
          settings={settings}
          showSessionHeader={showSessionHeader}
        />
      );
    case "standings-apex":
      return (
        <StandingsApexTemplate model={model} settings={settings} showSessionHeader={showSessionHeader} />
      );
    case "standings-neo":
      return (
        <StandingsNeoTemplate model={model} settings={settings} showSessionHeader={showSessionHeader} />
      );
    case "standings-redline":
      return (
        <StandingsRedlineTemplate
          model={model}
          settings={settings}
          showSessionHeader={showSessionHeader}
        />
      );
    case "standings-tower":
    case "standings-strip":
      return (
        <TableTemplate
          model={model}
          settings={settings}
          showSessionHeader={showSessionHeader}
          isTower={templateId === "standings-tower"}
        />
      );
  }
}

export function StandingsEndurance({ model, settings, layout }: WidgetRendererProps<StandingsViewModel>) {
  const parsed = parseStandingsEnduranceSettings(settings);
  const viewportHeight = layout === undefined
    ? Number.POSITIVE_INFINITY
    : parsed.templateId === "standings-redline"
      ? layout.h
      : resolveWidgetVisualGeometryForType(layout, "standings").baseHeight;
  const fittedModel = {
    ...model,
    rows: fitStandingsRowsToHeight(model.rows, {
      templateId: parsed.templateId,
      viewportHeight,
      showSessionHeader: parsed.showSessionHeader,
      hasStatusMessage: Boolean(model.statusMessage),
    }),
  };

  return (
    <section
      data-widget-system="vantare-endurance"
      data-widget-renderer="standings"
      data-status={model.status}
      data-template={parsed.templateId}
      className="ven-root ven-standings"
      style={buildStandingsAppearanceStyle(settings)}
    >
      {templateBody(parsed.templateId, fittedModel, settings, parsed.showSessionHeader)}
    </section>
  );
}
