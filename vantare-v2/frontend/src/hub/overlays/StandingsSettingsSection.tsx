import type { ColumnConfig, ProfileConfig, WidgetConfig } from "../../lib/profile";
import { getStandingsColumn } from "../../overlay/widgets/standings-catalog";
import { findWidgetVariant, toggleStandingsColumn, withDefaultWidgetVariants } from "../../lib/widget-variants";

const MIN_NAME_MAX_CHARS = 2;
const MAX_NAME_MAX_CHARS = 64;
const MIN_LAP_WIDTH = 36;
const MAX_LAP_WIDTH = 160;
const DEFAULT_LAP_COLOR = "#ffffff";

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function readStringDefault(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readNumberDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

type StandingsSettingsSectionProps = {
  profile: ProfileConfig;
  widget: WidgetConfig;
  onChangeProfile: (profile: ProfileConfig) => void;
};

type StandingsColumnId =
  | "driverName"
  | "gap"
  | "vehicleClass"
  | "currentLap"
  | "interval"
  | "bestLap"
  | "lastLap";

function updateStandingsColumn(
  profile: ProfileConfig,
  widgetId: string,
  columnId: StandingsColumnId,
  update: (column: ColumnConfig) => ColumnConfig,
): ProfileConfig {
  const normalized = withDefaultWidgetVariants(profile);
  const widget = normalized.widgets.find((item) => item.id === widgetId && item.type === "standings");
  if (!widget?.variantId) return normalized;

  return {
    ...normalized,
    variants: (normalized.variants ?? []).map((variant) => {
      if (variant.id !== widget.variantId || variant.widgetType !== "standings") return variant;
      return {
        ...variant,
        columns: (variant.columns ?? []).map((column) =>
          column.id === columnId ? update(column) : column,
        ),
      };
    }),
  };
}

function DriverNameControls({
  profile,
  widget,
  columns,
  onChangeProfile,
}: {
  profile: ProfileConfig;
  widget: WidgetConfig;
  columns: ColumnConfig[];
  onChangeProfile: (profile: ProfileConfig) => void;
}) {
  const driverColumn = columns.find((column) => column.id === "driverName");
  const def = getStandingsColumn("driverName");
  const mode = readStringDefault(driverColumn?.format?.mode, (def?.format?.mode as string | undefined) ?? "full");
  const maxChars = readNumberDefault(driverColumn?.format?.maxChars, (def?.format?.maxChars as number | undefined) ?? 16);

  return (
    <div className="space-y-3">
      <label className="block text-[11px] text-vantare-textMuted">
        Formato de nombre
        <select
          aria-label="Formato de nombre standings"
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
          value={mode}
          onChange={(event) =>
            onChangeProfile(
              updateStandingsColumn(profile, widget.id, "driverName", (column) => ({
                ...column,
                format: { ...(column.format ?? {}), mode: event.target.value },
              })),
            )
          }
        >
          <option value="full">Nombre completo</option>
          <option value="truncate">Recortar</option>
        </select>
      </label>
      <label className="block text-[11px] text-vantare-textMuted">
        Máximo caracteres nombre
        <input
          aria-label="Máximo caracteres nombre standings"
          type="number"
          min={MIN_NAME_MAX_CHARS}
          max={MAX_NAME_MAX_CHARS}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
          value={maxChars}
          onChange={(event) =>
            onChangeProfile(
              updateStandingsColumn(profile, widget.id, "driverName", (column) => ({
                ...column,
                format: { ...(column.format ?? {}), maxChars: clampInt(Number(event.target.value), MIN_NAME_MAX_CHARS, MAX_NAME_MAX_CHARS) },
              })),
            )
          }
        />
      </label>
    </div>
  );
}

function LapColumnControls({
  columnId,
  labelPrefix,
  profile,
  widget,
  columns,
  onChangeProfile,
}: {
  columnId: "bestLap" | "lastLap";
  labelPrefix: string;
  profile: ProfileConfig;
  widget: WidgetConfig;
  columns: ColumnConfig[];
  onChangeProfile: (profile: ProfileConfig) => void;
}) {
  const column = columns.find((item) => item.id === columnId);
  const def = getStandingsColumn(columnId);
  const display = readStringDefault(column?.format?.display, (def?.format?.display as string | undefined) ?? "full");
  const decimalsRaw = column?.format?.decimals;
  const decimals = typeof decimalsRaw === "number" ? String(decimalsRaw) : String((def?.format?.decimals as number | undefined) ?? 3);
  const width = readNumberDefault(column?.width, def?.defaultWidth ?? 76);
  const color = readStringDefault(column?.style?.color, DEFAULT_LAP_COLOR);
  const align = readStringDefault(column?.style?.align, (def?.style?.align as string | undefined) ?? "right");

  const setFormat = (key: "display" | "decimals", value: unknown) =>
    onChangeProfile(
      updateStandingsColumn(profile, widget.id, columnId, (current) => ({
        ...current,
        format: { ...(current.format ?? {}), [key]: value },
      })),
    );

  const ariaBase = `${labelPrefix.toLowerCase()} standings`;

  return (
    <div className="space-y-3 border-t border-white/5 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-vantare-textMuted">{labelPrefix}</p>
      <label className="block text-[11px] text-vantare-textMuted">
        {`Formato ${labelPrefix.toLowerCase()}`}
        <select
          aria-label={`Formato ${ariaBase}`}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
          value={display}
          onChange={(event) => setFormat("display", event.target.value)}
        >
          <option value="full">Completo (m:ss.mmm)</option>
          <option value="compact">Compacto (ss.mmm)</option>
        </select>
      </label>
      <label className="block text-[11px] text-vantare-textMuted">
        {`Decimales ${labelPrefix.toLowerCase()}`}
        <select
          aria-label={`Decimales ${ariaBase}`}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
          value={decimals}
          onChange={(event) => setFormat("decimals", Number(event.target.value))}
        >
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </label>
      <label className="block text-[11px] text-vantare-textMuted">
        {`Ancho ${labelPrefix.toLowerCase()}`}
        <input
          aria-label={`Ancho ${ariaBase}`}
          type="number"
          min={MIN_LAP_WIDTH}
          max={MAX_LAP_WIDTH}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
          value={width}
          onChange={(event) =>
            onChangeProfile(
              updateStandingsColumn(profile, widget.id, columnId, (current) => ({
                ...current,
                width: clampInt(Number(event.target.value), MIN_LAP_WIDTH, MAX_LAP_WIDTH),
              })),
            )
          }
        />
      </label>
      <label className="block text-[11px] text-vantare-textMuted">
        {`Color ${labelPrefix.toLowerCase()}`}
        <input
          aria-label={`Color ${ariaBase}`}
          type="color"
          className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/40 px-1 py-0.5 text-xs text-white"
          value={color}
          onChange={(event) =>
            onChangeProfile(
              updateStandingsColumn(profile, widget.id, columnId, (current) => ({
                ...current,
                style: { ...(current.style ?? {}), color: event.target.value },
              })),
            )
          }
        />
      </label>
      <label className="block text-[11px] text-vantare-textMuted">
        {`Alineación ${labelPrefix.toLowerCase()}`}
        <select
          aria-label={`Alineación ${ariaBase}`}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
          value={align}
          onChange={(event) =>
            onChangeProfile(
              updateStandingsColumn(profile, widget.id, columnId, (current) => ({
                ...current,
                style: { ...(current.style ?? {}), align: event.target.value },
              })),
            )
          }
        >
          <option value="left">Izquierda</option>
          <option value="center">Centro</option>
          <option value="right">Derecha</option>
        </select>
      </label>
    </div>
  );
}

function ColumnSwitch({
  label,
  description,
  enabled,
  ariaLabel,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  ariaLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={onToggle}
      className="flex w-full cursor-pointer select-none items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-left text-sm text-white transition-colors hover:border-white/15 hover:bg-black/30"
    >
      <span>
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[10px] text-vantare-textMuted">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={`h-5 w-9 rounded-full border p-0.5 transition-colors ${
          enabled ? "border-vantare-red-500 bg-vantare-red-600" : "border-white/15 bg-black/40"
        }`}
      >
        <span
          className={`block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

export function StandingsSettingsSection({ profile, widget, onChangeProfile }: StandingsSettingsSectionProps) {
  if (widget.type !== "standings") return null;

  const normalized = withDefaultWidgetVariants(profile);
  const normalizedWidget = normalized.widgets.find((item) => item.id === widget.id) ?? widget;
  const variant = findWidgetVariant(normalized, normalizedWidget);
  const columns = variant?.columns ?? [];

  const isEnabled = (columnId: string) => columns.find((column) => column.id === columnId)?.enabled ?? false;
  const updateColumn = (columnId: "vehicleClass" | "currentLap" | "interval" | "bestLap" | "lastLap", enabled: boolean) => {
    onChangeProfile(toggleStandingsColumn(normalized, widget.id, columnId, enabled));
  };

  return (
    <section className="border-t border-white/5 bg-vantare-panel px-5 py-4">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-vantare-text">COLUMNAS STANDINGS</h3>
      <div className="space-y-3">
        <ColumnSwitch
          label="Mostrar clase"
          description="Añade `vehicleClass` como columna opcional."
          enabled={isEnabled("vehicleClass")}
          ariaLabel="Mostrar clase standings"
          onToggle={() => updateColumn("vehicleClass", !isEnabled("vehicleClass"))}
        />
        <ColumnSwitch
          label="Mostrar vuelta actual"
          description="Añade `currentLap` como columna opcional."
          enabled={isEnabled("currentLap")}
          ariaLabel="Mostrar vuelta actual standings"
          onToggle={() => updateColumn("currentLap", !isEnabled("currentLap"))}
        />
        <ColumnSwitch
          label="Mostrar intervalo"
          description="Añade `interval` como columna opcional."
          enabled={isEnabled("interval")}
          ariaLabel="Mostrar intervalo standings"
          onToggle={() => updateColumn("interval", !isEnabled("interval"))}
        />
        <ColumnSwitch
          label="Mostrar mejor vuelta"
          description="Añade `bestLap` como columna opcional."
          enabled={isEnabled("bestLap")}
          ariaLabel="Mostrar mejor vuelta standings"
          onToggle={() => updateColumn("bestLap", !isEnabled("bestLap"))}
        />
        <ColumnSwitch
          label="Mostrar última vuelta"
          description="Añade `lastLap` como columna opcional."
          enabled={isEnabled("lastLap")}
          ariaLabel="Mostrar última vuelta standings"
          onToggle={() => updateColumn("lastLap", !isEnabled("lastLap"))}
        />
      </div>

      <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
        <DriverNameControls
          profile={normalized}
          widget={widget}
          columns={columns}
          onChangeProfile={onChangeProfile}
        />
        <LapColumnControls
          columnId="bestLap"
          labelPrefix="Mejor vuelta"
          profile={normalized}
          widget={widget}
          columns={columns}
          onChangeProfile={onChangeProfile}
        />
        <LapColumnControls
          columnId="lastLap"
          labelPrefix="Última vuelta"
          profile={normalized}
          widget={widget}
          columns={columns}
          onChangeProfile={onChangeProfile}
        />
      </div>
    </section>
  );
}
