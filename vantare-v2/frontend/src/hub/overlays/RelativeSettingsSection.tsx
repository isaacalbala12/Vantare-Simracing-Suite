import type { ColumnConfig, ProfileConfig, WidgetConfig } from "../../lib/profile";
import {
  DEFAULT_RELATIVE_FILTERS,
  RELATIVE_RANGE_MAX,
  RELATIVE_RANGE_MIN,
  getRelativeFilters,
} from "../../overlay/widgets/relative-filters";
import { findWidgetVariant, toggleRelativeColumn, withDefaultWidgetVariants } from "../../lib/widget-variants";
import { StudioSectionHeader, StudioSettingRow, StudioSubsectionLabel } from "./studio-controls";

type RelativeSettingsSectionProps = {
  profile: ProfileConfig;
  widget: WidgetConfig;
  onChangeProfile: (profile: ProfileConfig) => void;
};

type RelativeColumnId = "driverName" | "bestLap" | "lastLap";

function updateRelativeColumn(
  profile: ProfileConfig,
  widgetId: string,
  columnId: RelativeColumnId,
  update: (column: ColumnConfig) => ColumnConfig,
): ProfileConfig {
  const normalized = withDefaultWidgetVariants(profile);
  const widget = normalized.widgets.find((item) => item.id === widgetId && item.type === "relative");
  if (!widget?.variantId) return profile;

  return {
    ...normalized,
    variants: (normalized.variants ?? []).map((variant) => {
      if (variant.id !== widget.variantId || variant.widgetType !== "relative") return variant;
      return {
        ...variant,
        columns: (variant.columns ?? []).map((column) =>
          column.id === columnId ? update(column) : column,
        ),
      };
    }),
  };
}

const RANGE_OPTIONS = Array.from(
  { length: RELATIVE_RANGE_MAX - RELATIVE_RANGE_MIN + 1 },
  (_, index) => RELATIVE_RANGE_MIN + index,
);

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

function clampRangeInput(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_RELATIVE_FILTERS.rangeAhead;
  return Math.max(RELATIVE_RANGE_MIN, Math.min(RELATIVE_RANGE_MAX, Math.round(n)));
}

function updateRelativeFilters(
  profile: ProfileConfig,
  widgetId: string,
  update: (filters: Record<string, unknown>) => Record<string, unknown>,
): ProfileConfig {
  const normalized = withDefaultWidgetVariants(profile);
  const widget = normalized.widgets.find((item) => item.id === widgetId && item.type === "relative");
  if (!widget?.variantId) return profile;

  return {
    ...normalized,
    variants: (normalized.variants ?? []).map((variant) => {
      if (variant.id !== widget.variantId || variant.widgetType !== "relative") return variant;
      return {
        ...variant,
        filters: update(variant.filters ?? { ...DEFAULT_RELATIVE_FILTERS }),
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
  const mode = (driverColumn?.format?.mode as string | undefined) ?? "full";
  const maxChars = (driverColumn?.format?.maxChars as number | undefined) ?? 18;

  return (
    <div className="space-y-1.5">
      <StudioSettingRow label="Formato de nombre" htmlFor="relative-driver-mode">
        <select
          id="relative-driver-mode"
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
          value={mode}
          onChange={(event) =>
            onChangeProfile(
              updateRelativeColumn(profile, widget.id, "driverName", (column) => ({
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
      <StudioSettingRow label="Máximo caracteres nombre" htmlFor="relative-driver-max">
        <input
          id="relative-driver-max"
          type="number"
          min={2}
          max={64}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
          value={maxChars}
          onChange={(event) =>
            onChangeProfile(
              updateRelativeColumn(profile, widget.id, "driverName", (column) => ({
                ...column,
                format: { ...(column.format ?? {}), maxChars: Number(event.target.value) },
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
  const display = (column?.format?.display as string | undefined) ?? "full";
  const decimalsRaw = column?.format?.decimals;
  const decimals = typeof decimalsRaw === "number" ? String(decimalsRaw) : "3";
  const width = column?.width ?? 62;
  const color = (column?.style?.color as string | undefined) ?? "#ffffff";
  const align = (column?.style?.align as string | undefined) ?? "right";

  const setFormat = (key: "display" | "decimals", value: unknown) =>
    onChangeProfile(
      updateRelativeColumn(profile, widget.id, columnId, (current) => ({
        ...current,
        format: { ...(current.format ?? {}), [key]: value },
      })),
    );

  return (
    <div className="space-y-1.5 border-t border-white/5 pt-2">
      <StudioSubsectionLabel>{labelPrefix}</StudioSubsectionLabel>
      <StudioSettingRow label={`Formato ${labelPrefix.toLowerCase()}`} htmlFor={`relative-${columnId}-display`}>
        <select
          id={`relative-${columnId}-display`}
          aria-label={`Formato ${labelPrefix.toLowerCase()}`}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
          value={display}
          onChange={(event) => setFormat("display", event.target.value)}
        >
          <option value="full">Completo (m:ss.mmm)</option>
          <option value="compact">Compacto (ss.mmm)</option>
        </select>
      </StudioSettingRow>
      <StudioSettingRow label={`Decimales ${labelPrefix.toLowerCase()}`} htmlFor={`relative-${columnId}-decimals`}>
        <select
          id={`relative-${columnId}-decimals`}
          aria-label={`Decimales ${labelPrefix.toLowerCase()}`}
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
      <StudioSettingRow label={`Ancho ${labelPrefix.toLowerCase()}`} htmlFor={`relative-${columnId}-width`}>
        <input
          id={`relative-${columnId}-width`}
          aria-label={`Ancho ${labelPrefix.toLowerCase()}`}
          type="number"
          min={36}
          max={160}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
          value={width}
          onChange={(event) =>
            onChangeProfile(
              updateRelativeColumn(profile, widget.id, columnId, (current) => ({
                ...current,
                width: Number(event.target.value),
              })),
            )
          }
        />
      </StudioSettingRow>
      <StudioSettingRow label={`Color ${labelPrefix.toLowerCase()}`} htmlFor={`relative-${columnId}-color`}>
        <input
          id={`relative-${columnId}-color`}
          aria-label={`Color ${labelPrefix.toLowerCase()}`}
          type="color"
          className="h-7 w-full rounded-md border border-white/10 bg-black/40 px-1 py-0.5 focus:border-vantare-borderHover focus:outline-none"
          value={color}
          onChange={(event) =>
            onChangeProfile(
              updateRelativeColumn(profile, widget.id, columnId, (current) => ({
                ...current,
                style: { ...(current.style ?? {}), color: event.target.value },
              })),
            )
          }
        />
      </StudioSettingRow>
      <StudioSettingRow label={`Alineación ${labelPrefix.toLowerCase()}`} htmlFor={`relative-${columnId}-align`}>
        <select
          id={`relative-${columnId}-align`}
          aria-label={`Alineación ${labelPrefix.toLowerCase()}`}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
          value={align}
          onChange={(event) =>
            onChangeProfile(
              updateRelativeColumn(profile, widget.id, columnId, (current) => ({
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

export function RelativeSettingsSection({ profile, widget, onChangeProfile }: RelativeSettingsSectionProps) {
  if (widget.type !== "relative") return null;

  const normalized = withDefaultWidgetVariants(profile);
  const variant = findWidgetVariant(normalized, widget);
  const columns = variant?.columns ?? [];
  const filters = getRelativeFilters(variant?.filters);
  const rangeAhead = filters.rangeAhead;
  const rangeBehind = filters.rangeBehind;
  const classScope = filters.classScope;
  const includePlayer = filters.includePlayer;
  const rowHeightMode = filters.rowHeightMode;
  const bestLapEnabled = columns.find((column) => column.id === "bestLap")?.enabled ?? false;
  const lastLapEnabled = columns.find((column) => column.id === "lastLap")?.enabled ?? false;
  const updateColumn = (columnId: "bestLap" | "lastLap", enabled: boolean) => {
    onChangeProfile(toggleRelativeColumn(normalized, widget.id, columnId, enabled));
  };

  return (
    <section className="border-t border-white/5 bg-vantare-panel/60 px-4 py-3">
      <StudioSectionHeader title="Columnas relative" hint="Columnas opcionales y visibilidad del jugador" />

      <div className="mt-3 space-y-1.5">
        <ColumnSwitch
          label="Mostrar mejor vuelta"
          description="Añade `bestLap` como columna opcional."
          enabled={bestLapEnabled}
          ariaLabel="Mostrar mejor vuelta"
          onToggle={() => updateColumn("bestLap", !bestLapEnabled)}
        />
        <ColumnSwitch
          label="Mostrar última vuelta"
          description="Añade `lastLap` como columna opcional."
          enabled={lastLapEnabled}
          ariaLabel="Mostrar última vuelta"
          onToggle={() => updateColumn("lastLap", !lastLapEnabled)}
        />
      </div>

      <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3" data-testid="relative-filters">
        <StudioSectionHeader title="Filtros" hint="Rango, clase y altura de filas" />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <StudioSettingRow label="Coches delante" htmlFor="relative-range-ahead">
            <select
              id="relative-range-ahead"
              className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
              value={rangeAhead}
              onChange={(event) =>
                onChangeProfile(
                  updateRelativeFilters(normalized, widget.id, (current) => ({
                    ...current,
                    rangeAhead: clampRangeInput(event.target.value),
                  })),
                )
              }
            >
              {RANGE_OPTIONS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </StudioSettingRow>
          <StudioSettingRow label="Coches detrás" htmlFor="relative-range-behind">
            <select
              id="relative-range-behind"
              className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
              value={rangeBehind}
              onChange={(event) =>
                onChangeProfile(
                  updateRelativeFilters(normalized, widget.id, (current) => ({
                    ...current,
                    rangeBehind: clampRangeInput(event.target.value),
                  })),
                )
              }
            >
              {RANGE_OPTIONS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </StudioSettingRow>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <StudioSettingRow label="Filtro de clase" htmlFor="relative-class-scope">
            <select
              id="relative-class-scope"
              className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
              value={classScope}
              onChange={(event) =>
                onChangeProfile(
                  updateRelativeFilters(normalized, widget.id, (current) => ({
                    ...current,
                    classScope: event.target.value === "sameClass" ? "sameClass" : "all",
                  })),
                )
              }
            >
              <option value="all">Todas las clases</option>
              <option value="sameClass">Misma clase</option>
            </select>
          </StudioSettingRow>
          <StudioSettingRow label="Altura de filas" htmlFor="relative-row-height">
            <select
              id="relative-row-height"
              className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:border-vantare-borderHover focus:outline-none"
              value={rowHeightMode}
              onChange={(event) =>
                onChangeProfile(
                  updateRelativeFilters(normalized, widget.id, (current) => ({
                    ...current,
                    rowHeightMode: event.target.value === "compact" ? "compact" : "fill",
                  })),
                )
              }
            >
              <option value="fill">Rellenar</option>
              <option value="compact">Compacto</option>
            </select>
          </StudioSettingRow>
        </div>
        <ColumnSwitch
          label="Mostrar coche del jugador"
          description="Incluye la fila central del piloto en la tabla."
          enabled={includePlayer}
          ariaLabel="Mostrar coche del jugador"
          onToggle={() =>
            onChangeProfile(
              updateRelativeFilters(normalized, widget.id, (current) => ({
                ...current,
                includePlayer: !(typeof current.includePlayer === "boolean" ? current.includePlayer : DEFAULT_RELATIVE_FILTERS.includePlayer),
              })),
            )
          }
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
