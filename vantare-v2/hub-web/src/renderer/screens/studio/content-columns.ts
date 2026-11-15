import tablePresets from "../../../../../native/hub-host/data/table-presets.json";
import type {
  WidgetColumnPatch,
  WidgetColumnSetting,
  WidgetSettings,
  WidgetSettingsPatch,
} from "../../../contract/generated/studio";
import {
  studioWidgetDefaults,
  studioWidgetOptions,
} from "../../../contract/generated/studio";

export type ColumnSession = "practice" | "qualifying" | "race";
export type TableSettings = Extract<
  WidgetSettings,
  { kind: "standings" | "relative" }
>;
const keyFor = (session: ColumnSession) =>
  session === "race"
    ? "columns"
    : session === "practice"
      ? "practiceColumns"
      : "qualifyingColumns";

// Same native-generated recipes already used by the host/mock. No copied presets.
export function contentColumns(
  settings: TableSettings,
  session: ColumnSession,
): WidgetColumnSetting[] | null {
  const columns =
    settings.kind === "standings" && session !== "race"
      ? (settings[keyFor(session) as "practiceColumns" | "qualifyingColumns"] ??
        settings.columns)
      : settings.columns;
  return (
    columns ??
    (settings.designSystem === "vantare"
      ? tablePresets.recipes[settings.kind].standard
      : null)
  );
}
export function requiredColumn(settings: TableSettings, metric: string) {
  return (
    settings.designSystem === "vantare" &&
    (metric === "driverName" ||
      (settings.kind === "standings" && metric === "position"))
  );
}
function metric(value: string) {
  return studioWidgetOptions.columns.metrics.find((id) => id === value);
}
function fullColumn(column: WidgetColumnSetting): WidgetColumnPatch | null {
  const id = metric(column.metricId);
  const width = studioWidgetOptions.columns.widths.find(
    (value) => value === column.widthPreset,
  );
  if (!id || !width) return null;
  const mode = studioWidgetOptions.columns.names.find(
    (value) => value === column.format.mode,
  );
  if (column.format.mode !== "" && !mode) return null;
  return {
    metric: id,
    enabled: column.enabled,
    widthPreset: width,
    format: { ...(mode ? { mode } : {}), maxChars: column.format.maxChars },
    style: {
      align:
        studioWidgetOptions.columns.aligns.find(
          (value) => value === column.style.align,
        ) ?? null,
    },
  };
}
function identities(
  columns: readonly WidgetColumnSetting[],
  full: boolean,
): WidgetColumnPatch[] | null {
  const result: WidgetColumnPatch[] = [];
  const seen = new Set<string>();
  for (const column of columns) {
    const id = metric(column.metricId);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const value = full ? fullColumn(column) : { metric: id };
    if (!value) return null;
    result.push(value);
  }
  return result;
}
function tablePatch(
  settings: TableSettings,
  session: ColumnSession,
  columns: WidgetColumnPatch[],
): WidgetSettingsPatch | null {
  if (settings.kind === "relative") return { kind: "relative", columns };
  const patch: Extract<WidgetSettingsPatch, { kind: "standings" }> = {
    kind: "standings",
    [keyFor(session)]: columns,
  };
  // GPUI SessionSettings::session_columns_mut detaches legacy inheritance when Race changes.
  if (session === "race") {
    const inherited = contentColumns(settings, "race");
    if (!inherited) return null;
    const frozen = identities(inherited, settings.columns === null);
    if (!frozen) return null;
    if (settings.practiceColumns == null) patch.practiceColumns = frozen;
    if (settings.qualifyingColumns == null) patch.qualifyingColumns = frozen;
  }
  return patch;
}
export function editColumn(
  settings: TableSettings,
  session: ColumnSession,
  selected: string,
  change: Omit<WidgetColumnPatch, "metric">,
): WidgetSettingsPatch | null {
  const columns = contentColumns(settings, session);
  if (!columns?.some((column) => column.metricId === selected)) return null;
  if (change.enabled === false && requiredColumn(settings, selected))
    return null;
  const inherited =
    settings.kind === "standings" && session !== "race"
      ? (settings[keyFor(session) as "practiceColumns" | "qualifyingColumns"] ??
        settings.columns)
      : settings.columns;
  const edits = identities(columns, inherited === null);
  if (!edits) return null;
  return tablePatch(
    settings,
    session,
    edits.map((entry) =>
      entry.metric === selected ? { ...entry, ...change } : entry,
    ),
  );
}
export function canResetColumns(
  settings: TableSettings,
  session: ColumnSession,
) {
  const columns = contentColumns(settings, session);
  return (
    columns !== null &&
    identities(columns, false) !== null &&
    !columns.some(
      (column) =>
        column.format.display !== null ||
        column.format.decimals !== null ||
        (column.format.mode !== "" && column.format.mode !== "full"),
    )
  );
}
export function canEditColumns(
  settings: TableSettings,
  session: ColumnSession,
) {
  const columns = contentColumns(settings, session);
  return columns !== null && identities(columns, false) !== null;
}
export function resetColumns(
  settings: Extract<WidgetSettings, { kind: "standings" }>,
  session: ColumnSession,
) {
  if (!canResetColumns(settings, session)) return null;
  const defaults = studioWidgetDefaults.standings;
  const recipe =
    session === "race"
      ? defaults.columns
      : session === "practice"
        ? defaults.practiceColumns
        : defaults.qualifyingColumns;
  const columns = identities(recipe, true);
  return columns ? tablePatch(settings, session, columns) : null;
}
