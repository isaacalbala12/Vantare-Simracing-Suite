import type { ColumnConfig, ProfileConfig, WidgetConfig } from "../../lib/profile";
import { getStandingsColumn } from "../../overlay/widgets/standings-catalog";
import { findWidgetVariant, toggleStandingsColumn, withDefaultWidgetVariants } from "../../lib/widget-variants";
import { StudioSectionHeader, StudioSettingRow, StudioSubsectionLabel } from "./studio-controls";

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
    <div className="space-y-1.5">
      <StudioSettingRow label="Formato de nombre" htmlFor="standings-driver-mode">
        <select
          id="standings-driver-mode"
          aria-label="Formato de nombre standings"
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
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
      </StudioSettingRow>
      <StudioSettingRow label="Máximo caracteres nombre" htmlFor="standings-driver-max">
        <input
          id="standings-driver-max"
          aria-label="Máximo caracteres nombre standings"
          type="number"
          min={MIN_NAME_MAX_CHARS}
          max={MAX_NAME_MAX_CHARS}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
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
      </StudioSettingRow>
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
    <div className="space-y-1.5 border-t border-white/5 pt-2">
      <StudioSubsectionLabel>{labelPrefix}</StudioSubsectionLabel>
      <StudioSettingRow label={`Formato ${labelPrefix.toLowerCase()}`} htmlFor={`standings-${columnId}-display`}>
        <select
          id={`standings-${columnId}-display`}
          aria-label={`Formato ${ariaBase}`}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
          value={display}
          onChange={(event) => setFormat("display", event.target.value)}
        >
          <option value="full">Completo (m:ss.mmm)</option>
          <option value="compact">Compacto (ss.mmm)</option>
        </select>
      </StudioSettingRow>
      <StudioSettingRow label={`Decimales ${labelPrefix.toLowerCase()}`} htmlFor={`standings-${columnId}-decimals`}>
        <select
          id={`standings-${columnId}-decimals`}
          aria-label={`Decimales ${ariaBase}`}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
          value={decimals}
          onChange={(event) => setFormat("decimals", Number(event.target.value))}
        >
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </StudioSettingRow>
      <StudioSettingRow label={`Ancho ${labelPrefix.toLowerCase()}`} htmlFor={`standings-${columnId}-width`}>
        <input
          id={`standings-${columnId}-width`}
          aria-label={`Ancho ${ariaBase}`}
          type="number"
          min={MIN_LAP_WIDTH}
          max={MAX_LAP_WIDTH}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
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
      </StudioSettingRow>
      <StudioSettingRow label={`Color ${labelPrefix.toLowerCase()}`} htmlFor={`standings-${columnId}-color`}>
        <input
          id={`standings-${columnId}-color`}
          aria-label={`Color ${ariaBase}`}
          type="color"
          className="h-7 w-full rounded-md border border-white/10 bg-black/40 px-1 py-0.5 focus:border-vantare-borderHover focus:outline-none"
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
      </StudioSettingRow>
      <StudioSettingRow label={`Alineación ${labelPrefix.toLowerCase()}`} htmlFor={`standings-${columnId}-align`}>
        <select
          id={`standings-${columnId}-align`}
          aria-label={`Alineación ${ariaBase}`}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
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
      </StudioSettingRow>
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
      className="flex w-full cursor-pointer select-none items-center justify-between gap-3 rounded-md border border-white/5 bg-black/30 px-2.5 py-1.5 text-left text-white transition-colors hover:border-white/15 hover:bg-black/40"
    >
      <span className="min-w-0">
        <span className="block truncate font-mono text-[11px] font-bold uppercase tracking-wide">{label}</span>
        <span className="block truncate font-mono text-[9px] uppercase tracking-widest text-vantare-textDim">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors ${
          enabled ? "border-vantare-red-500 bg-vantare-red-600" : "border-white/15 bg-black/50"
        }`}
      >
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-3.5" : "translate-x-0.5"
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
    <section className="border-t border-white/5 bg-vantare-panel/60 px-4 py-3">
      <StudioSectionHeader title="Columnas standings" hint="Columnas opcionales y formato" />

      <div className="mt-3 space-y-1.5">
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

      <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
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
