import { useState } from "react";
import type { WidgetConfig } from "../../lib/profile";
import { getWidgetCatalogEntry } from "./widget-catalog";
import {
  buildDefaultSlots,
  buildDefaultColumns,
  buildDefaultColumnGroups,
} from "./widget-config-model";

type WidgetConfigSectionsProps = {
  widget: WidgetConfig;
};

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
        className="flex w-full items-center justify-between px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-vantare-textMuted hover:text-white cursor-pointer"
      >
        <span>
          {title} <span className="text-vantare-textDim">({count})</span>
        </span>
        <span className="text-vantare-textDim">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

export function WidgetConfigSections({
  widget,
}: WidgetConfigSectionsProps) {
  const entry = getWidgetCatalogEntry(widget.type);
  if (!entry) return null;

  const defaultSlots = buildDefaultSlots(widget.type, undefined);
  const defaultColumns = buildDefaultColumns(widget.type, undefined);
  const defaultColumnGroups = buildDefaultColumnGroups(widget.type, undefined);

  const hasSlots = defaultSlots.length > 0;
  const hasColumns = defaultColumns.length > 0;
  const hasColumnGroups = defaultColumnGroups.length > 0;

  if (!hasSlots && !hasColumns && !hasColumnGroups) return null;

  return (
    <div data-testid="widget-config-sections">
      <div className="flex items-center justify-between border-t border-white/5 px-3 py-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-vantare-textDim">
          Config structure
        </span>
        <span
          className="font-mono text-[9px] uppercase tracking-widest text-vantare-textDim/60"
          data-testid="widget-config-read-only"
        >
          Read-only · foundation
        </span>
      </div>
      {hasSlots && (
        <CollapsibleSection title="Slots" count={defaultSlots.length} defaultOpen>
          {defaultSlots.map((slot) => (
            <div
              key={slot.id}
              className="flex items-center justify-between py-1 font-mono text-[10px] text-vantare-textMuted"
            >
              <span>{slot.id}</span>
              <div className="flex items-center gap-2">
                <span className="text-vantare-textDim">{slot.metricId}</span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${slot.enabled ? "bg-[#22c55e]" : "bg-vantare-textDim"}`}
                />
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {hasColumns && (
        <CollapsibleSection title="Columns" count={defaultColumns.length} defaultOpen>
          {defaultColumns.map((col) => (
            <div
              key={col.id}
              className="flex items-center justify-between py-1 font-mono text-[10px] text-vantare-textMuted"
            >
              <span>{col.id}</span>
              <div className="flex items-center gap-2">
                <span className="text-vantare-textDim">{col.metricId}</span>
                {col.width != null && (
                  <span className="text-vantare-textDim">{col.width}</span>
                )}
                <span
                  className={`h-1.5 w-1.5 rounded-full ${col.enabled ? "bg-[#22c55e]" : "bg-vantare-textDim"}`}
                />
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {hasColumnGroups && (
        <CollapsibleSection title="Column Groups" count={defaultColumnGroups.length} defaultOpen>
          {defaultColumnGroups.map((group) => (
            <div
              key={group.id}
              className="flex items-center justify-between py-1 font-mono text-[10px] text-vantare-textMuted"
            >
              <span>{group.id}</span>
              <div className="flex items-center gap-2">
                <span className="text-vantare-textDim">
                  {group.columns?.length ?? 0} columns
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${group.enabled ? "bg-[#22c55e]" : "bg-vantare-textDim"}`}
                />
              </div>
            </div>
          ))}
        </CollapsibleSection>
      )}
    </div>
  );
}
