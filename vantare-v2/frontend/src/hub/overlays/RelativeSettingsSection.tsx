import type { ColumnConfig, ProfileConfig, WidgetConfig } from "../../lib/profile";
import {
  DEFAULT_RELATIVE_FILTERS,
  RELATIVE_RANGE_MAX,
  RELATIVE_RANGE_MIN,
  getRelativeFilters,
} from "../../overlay/widgets/relative-filters";
import { findWidgetVariant, toggleRelativeColumn, withDefaultWidgetVariants } from "../../lib/widget-variants";

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
    <div className="space-y-3">
      <label className="block text-[11px] text-vantare-textMuted">
        Formato de nombre
        <select
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
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
      </label>
      <label className="block text-[11px] text-vantare-textMuted">
        Máximo caracteres nombre
        <input
          type="number"
          min={2}
          max={64}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
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
    <div className="space-y-3 border-t border-white/5 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-vantare-textMuted">{labelPrefix}</p>
      <label className="block text-[11px] text-vantare-textMuted">
        {`Formato ${labelPrefix.toLowerCase()}`}
        <select
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
          type="number"
          min={36}
          max={160}
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
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
      </label>
      <label className="block text-[11px] text-vantare-textMuted">
        {`Color ${labelPrefix.toLowerCase()}`}
        <input
          type="color"
          className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/40 px-1 py-0.5 text-xs text-white"
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
      </label>
      <label className="block text-[11px] text-vantare-textMuted">
        {`Alineación ${labelPrefix.toLowerCase()}`}
        <select
          className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
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
      </label>
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
    <section className="border-t border-white/5 bg-vantare-panel px-5 py-4">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-vantare-text">COLUMNAS RELATIVE</h3>
      <div className="space-y-3">
        <button
          type="button"
          role="switch"
          aria-checked={bestLapEnabled}
          aria-label="Mostrar mejor vuelta"
          onClick={() => updateColumn("bestLap", !bestLapEnabled)}
          className="flex w-full cursor-pointer select-none items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-left text-sm text-white transition-colors hover:border-white/15 hover:bg-black/30"
        >
          <span>
            <span className="block text-xs font-medium">Mostrar mejor vuelta</span>
            <span className="block text-[10px] text-vantare-textMuted">Añade `bestLap` como columna opcional.</span>
          </span>
          <span
            aria-hidden="true"
            className={`h-5 w-9 rounded-full border p-0.5 transition-colors ${
              bestLapEnabled ? "border-vantare-red-500 bg-vantare-red-600" : "border-white/15 bg-black/40"
            }`}
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                bestLapEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </span>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={lastLapEnabled}
          aria-label="Mostrar última vuelta"
          onClick={() => updateColumn("lastLap", !lastLapEnabled)}
          className="flex w-full cursor-pointer select-none items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-left text-sm text-white transition-colors hover:border-white/15 hover:bg-black/30"
        >
          <span>
            <span className="block text-xs font-medium">Mostrar última vuelta</span>
            <span className="block text-[10px] text-vantare-textMuted">Añade `lastLap` como columna opcional.</span>
          </span>
          <span
            aria-hidden="true"
            className={`h-5 w-9 rounded-full border p-0.5 transition-colors ${
              lastLapEnabled ? "border-vantare-red-500 bg-vantare-red-600" : "border-white/15 bg-black/40"
            }`}
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                lastLapEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </span>
        </button>
      </div>

      <div className="mt-4 space-y-3 border-t border-white/5 pt-4" data-testid="relative-filters">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-vantare-textMuted">Filtros</h4>
        <label className="block text-[11px] text-vantare-textMuted">
          Coches delante
          <select
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
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
        </label>
        <label className="block text-[11px] text-vantare-textMuted">
          Coches detrás
          <select
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
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
        </label>
        <label className="block text-[11px] text-vantare-textMuted">
          Filtro de clase
          <select
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
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
        </label>
        <p className="text-[10px] text-vantare-textMuted">
          Limita las filas a la clase del jugador o muestra todas.
        </p>
        <label className="block text-[11px] text-vantare-textMuted">
          Altura de filas
          <select
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
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
            <option value="fill">Rellenar altura del widget</option>
            <option value="compact">Reducir altura visual</option>
          </select>
        </label>
        <p className="text-[10px] text-vantare-textMuted">
          Decide si pocas filas se estiran o si el relative se dibuja más bajo.
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={includePlayer}
          aria-label="Mostrar coche del jugador"
          onClick={() =>
            onChangeProfile(
              updateRelativeFilters(normalized, widget.id, (current) => ({
                ...current,
                includePlayer: !(typeof current.includePlayer === "boolean" ? current.includePlayer : DEFAULT_RELATIVE_FILTERS.includePlayer),
              })),
            )
          }
          className="flex w-full cursor-pointer select-none items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-left text-sm text-white transition-colors hover:border-white/15 hover:bg-black/30"
        >
          <span>
            <span className="block text-xs font-medium">Mostrar coche del jugador</span>
            <span className="block text-[10px] text-vantare-textMuted">Incluye la fila central del piloto en la tabla.</span>
          </span>
          <span
            aria-hidden="true"
            className={`h-5 w-9 rounded-full border p-0.5 transition-colors ${
              includePlayer ? "border-vantare-red-500 bg-vantare-red-600" : "border-white/15 bg-black/40"
            }`}
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                includePlayer ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </span>
        </button>
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
