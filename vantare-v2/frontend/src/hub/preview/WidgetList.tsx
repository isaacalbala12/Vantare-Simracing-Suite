import { useRef, useState, useMemo } from "react";
import type { WidgetConfig } from "../../lib/profile";
import { getWidgetStyle } from "../../lib/profile";
import { getStylesForType } from "../state/style-catalog";

type WidgetListProps = {
  widgets: WidgetConfig[];
  selectedWidgetId: string | null;
  onSelectWidget: (id: string | null) => void;
  onAddWidget?: (type: string) => void;
};

const WIDGET_TYPES = ["delta", "relative", "standings", "telemetry", "telemetry-vertical", "pedals", "engineer-notifications"];

// Map widget types to specific icon SVG paths
function getWidgetIcon(type: string) {
  switch (type) {
    case "delta":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    case "relative":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "standings":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      );
    case "pedals":
    case "telemetry":
    case "telemetry-vertical":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      );
    case "engineer-notifications":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9h8m-8 4h6m2 5a2 2 0 11-4 0h-5V7a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
  }
}

export function WidgetList({ widgets, selectedWidgetId, onSelectWidget, onAddWidget }: WidgetListProps) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "active">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const selectRef = useRef<HTMLSelectElement>(null);

  function handleAdd() {
    const type = selectRef.current?.value;
    if (!type) return;
    onAddWidget?.(type);
    setAdding(false);
  }

  const filteredWidgets = useMemo(() => {
    return widgets.filter((widget) => {
      const matchesFilter = filter === "all" ? true : widget.enabled;
      const matchesSearch = widget.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (widget.name && widget.name.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesFilter && matchesSearch;
    });
  }, [widgets, filter, searchQuery]);

  return (
    <aside className="glass-panel rounded-xl p-4 h-full flex flex-col overflow-hidden">
      {/* Header section with counts */}
      <div className="mb-3 flex items-center justify-between flex-shrink-0">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">Widgets</h2>
        <span className="font-mono text-[10px] text-vantare-textDim">{widgets.length}</span>
      </div>

      {/* Tabs Filter */}
      <div className="p-1 mb-3 flex items-center gap-1 bg-black/40 rounded-lg flex-shrink-0 border border-white/5">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`flex-1 py-1 text-[10px] font-bold uppercase rounded tracking-wide transition-colors ${
            filter === "all"
              ? "bg-vantare-red-900/30 text-white border border-vantare-red-500/30 shadow-inner"
              : "text-vantare-textMuted hover:text-white"
          }`}
        >
          TODOS
        </button>
        <button
          type="button"
          onClick={() => setFilter("active")}
          className={`flex-1 py-1 text-[10px] font-bold uppercase rounded tracking-wide transition-colors ${
            filter === "active"
              ? "bg-vantare-red-900/30 text-white border border-vantare-red-500/30 shadow-inner"
              : "text-vantare-textMuted hover:text-white"
          }`}
        >
          ACTIVOS
        </button>
      </div>

      {/* Search Input */}
      <div className="relative mb-3 flex-shrink-0">
        <svg className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-vantare-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Buscar..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg py-1.5 pl-8 pr-3 text-xs text-white placeholder-vantare-textDim focus:outline-none focus:border-vantare-red-500 transition-colors"
        />
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
        {filteredWidgets.map((widget) => {
          const currentStyle = getWidgetStyle(widget);
          const styles = getStylesForType(widget.type);
          const styleName = styles.find((s) => s.id === currentStyle)?.name ?? currentStyle;
          const isSelected = selectedWidgetId === widget.id;
          return (
            <button
              key={widget.id}
              type="button"
              data-testid={`widget-list-${widget.id}`}
              onClick={() => onSelectWidget(widget.id)}
              className={`rounded-lg border-l-2 py-2.5 px-3 text-left transition-all flex flex-col ${
                isSelected
                  ? "border-l-vantare-red-500 bg-gradient-to-r from-vantare-red-500/15 to-transparent border-t border-b border-r border-white/5 shadow-inner"
                  : "border-l-transparent border-t border-b border-r border-white/5 bg-black/25 hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <span className={isSelected ? "text-vantare-red-400" : "text-vantare-textMuted"}>
                    {getWidgetIcon(widget.type)}
                  </span>
                  <span className={`font-mono text-xs font-bold ${isSelected ? "text-white" : "text-vantare-text"}`}>
                    {widget.id}
                  </span>
                </div>
                <span className={`text-[10px] font-bold ${widget.enabled ? "text-emerald-400" : "text-vantare-textDim"}`}>
                  {widget.enabled ? "Visible" : "Oculto"}
                </span>
              </div>
              <span className="mt-1 block font-mono text-[10px] text-vantare-textDim pl-6">
                {widget.type} · {styleName} · {widget.position.w}×{widget.position.h}
              </span>
            </button>
          );
        })}
        {filteredWidgets.length === 0 && (
          <div className="text-center py-4 text-xs text-vantare-textDim font-mono">
            Sin widgets
          </div>
        )}
      </div>

      {adding ? (
        <div className="mt-3 flex items-center gap-2 flex-shrink-0 pt-2 border-t border-white/5">
          <select
            ref={selectRef}
            defaultValue="delta"
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
          >
            {WIDGET_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-lg bg-vantare-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-vantare-red-600 shadow"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-vantare-textMuted hover:text-white"
          >
            X
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 w-full rounded-lg border border-dashed border-white/10 py-2 text-xs text-vantare-textMuted hover:border-white/20 hover:text-white transition-colors flex-shrink-0"
        >
          + Añadir widget
        </button>
      )}
    </aside>
  );
}

