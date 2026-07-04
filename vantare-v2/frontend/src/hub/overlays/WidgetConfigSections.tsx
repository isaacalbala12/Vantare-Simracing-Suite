import { useState } from "react";
import type { SlotConfig, ColumnConfig, ColumnGroupConfig } from "../../lib/profile";
import {
  toggleSlotEnabled,
  updateSlotConfig,
  toggleColumnEnabled,
  updateColumnConfig,
  toggleColumnGroupEnabled,
  BUILTIN_METRICS,
  type WidthPreset,
} from "./widget-config-model";

type WidgetConfigSectionsProps = {
  slots: SlotConfig[];
  columns: ColumnConfig[];
  columnGroups: ColumnGroupConfig[];
  widgetType: string;
  canApply: boolean;
  onDraftChange: (draft: {
    slots?: SlotConfig[];
    columns?: ColumnConfig[];
    columnGroups?: ColumnGroupConfig[];
  }) => void;
};

const WIDTH_PRESETS: { value: WidthPreset; label: string }[] = [
  { value: "xs", label: "XS" },
  { value: "sm", label: "SM" },
  { value: "md", label: "MD" },
  { value: "lg", label: "LG" },
  { value: "auto", label: "Auto" },
];

function CollapsibleSection({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border-t border-white/5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left cursor-pointer"
        aria-expanded={open}
      >
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-vantare-textMuted">
          {title}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-vantare-textDim">{count}</span>
          <span className="text-vantare-textDim text-[10px]">{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        checked ? "bg-[#22c55e]" : "bg-vantare-textDim/40"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-3.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function MetricSelect({
  value,
  widgetType,
  onChange,
  disabled,
}: {
  value: string;
  widgetType: string;
  onChange: (metricId: string) => void;
  disabled: boolean;
}) {
  const compatible = BUILTIN_METRICS.filter((m) => m.compatibleWidgets.includes(widgetType));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Métrica"
    >
      {compatible.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

function WidthPresetSelect({
  value,
  onChange,
  disabled,
}: {
  value: WidthPreset | undefined;
  onChange: (preset: WidthPreset) => void;
  disabled: boolean;
}) {
  return (
    <select
      value={value ?? "auto"}
      onChange={(e) => onChange(e.target.value as WidthPreset)}
      disabled={disabled}
      className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Ancho"
    >
      {WIDTH_PRESETS.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

export function WidgetConfigSections({
  slots,
  columns,
  columnGroups,
  widgetType,
  canApply,
  onDraftChange,
}: WidgetConfigSectionsProps) {
  const hasSlots = slots.length > 0;
  const hasColumns = columns.length > 0;
  const hasColumnGroups = columnGroups.length > 0;

  if (!hasSlots && !hasColumns && !hasColumnGroups) return null;

  return (
    <div data-testid="widget-config-sections">
      {hasSlots && (
        <CollapsibleSection title="Slots" count={slots.length} defaultOpen>
          {slots.map((slot) => (
            <div
              key={slot.id}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Toggle
                  checked={slot.enabled}
                  disabled={!canApply}
                  onChange={() =>
                    onDraftChange({ slots: toggleSlotEnabled(slots, slot.id) })
                  }
                  label={`Toggle ${slot.id}`}
                />
                <span className="truncate font-mono text-[10px] text-vantare-textMuted">
                  {slot.id}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <MetricSelect
                  value={slot.metricId}
                  widgetType={widgetType}
                  disabled={!canApply}
                  onChange={(metricId) =>
                    onDraftChange({ slots: updateSlotConfig(slots, slot.id, { metricId }) })
                  }
                />
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {hasColumns && (
        <CollapsibleSection title="Columns" count={columns.length} defaultOpen>
          {columns.map((col) => (
            <div
              key={col.id}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Toggle
                  checked={col.enabled}
                  disabled={!canApply}
                  onChange={() =>
                    onDraftChange({ columns: toggleColumnEnabled(columns, col.id) })
                  }
                  label={`Toggle ${col.id}`}
                />
                <span className="truncate font-mono text-[10px] text-vantare-textMuted">
                  {col.id}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <MetricSelect
                  value={col.metricId}
                  widgetType={widgetType}
                  disabled={!canApply}
                  onChange={(metricId) =>
                    onDraftChange({ columns: updateColumnConfig(columns, col.id, { metricId }) })
                  }
                />
                <WidthPresetSelect
                  value={col.widthPreset}
                  disabled={!canApply}
                  onChange={(widthPreset) =>
                    onDraftChange({ columns: updateColumnConfig(columns, col.id, { widthPreset }) })
                  }
                />
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {hasColumnGroups && (
        <CollapsibleSection title="Column Groups" count={columnGroups.length} defaultOpen>
          {columnGroups.map((group) => (
            <div
              key={group.id}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Toggle
                  checked={group.enabled}
                  disabled={!canApply}
                  onChange={() =>
                    onDraftChange({
                      columnGroups: toggleColumnGroupEnabled(columnGroups, group.id),
                    })
                  }
                  label={`Toggle ${group.id}`}
                />
                <span className="truncate font-mono text-[10px] text-vantare-textMuted">
                  {group.id}
                </span>
              </div>
              <span className="font-mono text-[9px] text-vantare-textDim">
                {group.columns?.length ?? 0} cols
              </span>
            </div>
          ))}
        </CollapsibleSection>
      )}
    </div>
  );
}
