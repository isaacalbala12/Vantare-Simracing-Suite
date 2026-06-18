import { useMemo, useState } from "react";
import type { WidgetConfig } from "../../lib/profile";

type StudioWidgetListProps = {
  widgets: WidgetConfig[];
  selectedWidgetId: string | null;
  onSelectWidget: (id: string) => void;
};

export function StudioWidgetList({ widgets, selectedWidgetId, onSelectWidget }: StudioWidgetListProps) {
  const [filter, setFilter] = useState<"all" | "active">("all");
  const [query, setQuery] = useState("");

  const filteredWidgets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return widgets.filter((widget) => {
      if (filter === "active" && !widget.enabled) return false;
      if (!normalizedQuery) return true;
      return (
        widget.id.toLowerCase().includes(normalizedQuery) ||
        widget.type.toLowerCase().includes(normalizedQuery) ||
        (widget.name ?? "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [filter, query, widgets]);

  return (
    <aside className="card-sleek flex min-h-0 flex-col rounded-xl">
      <div className="border-b border-white/5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">Widgets</h2>
          <span className="font-mono text-[10px] text-vantare-textDim">{widgets.length}</span>
        </div>

        <div className="mt-3 flex gap-2 rounded-lg border border-white/5 bg-black/30 p-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`flex-1 rounded-md py-1 text-[10px] font-bold uppercase cursor-pointer ${
              filter === "all" ? "bg-white/10 text-white" : "text-vantare-textMuted hover:text-white"
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`flex-1 rounded-md py-1 text-[10px] font-bold uppercase cursor-pointer ${
              filter === "active" ? "bg-white/10 text-white" : "text-vantare-textMuted hover:text-white"
            }`}
          >
            Activos
          </button>
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar widget..."
          className="mt-3 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none placeholder:text-vantare-textDim focus:border-vantare-red-500/50"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filteredWidgets.map((widget) => {
          const selected = selectedWidgetId === widget.id;
          return (
            <button
              key={widget.id}
              type="button"
              onClick={() => onSelectWidget(widget.id)}
              className={`mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition-colors cursor-pointer ${
                selected
                  ? "border-vantare-red-500/50 bg-vantare-red-950/30 text-white"
                  : "border-white/5 bg-black/25 text-vantare-textMuted hover:text-white"
              }`}
            >
              <span>
                <span className="block font-mono text-xs font-bold">{widget.id}</span>
                <span className="block font-mono text-[10px] text-vantare-textDim">{widget.type}</span>
              </span>
              <span className={`text-[10px] font-bold ${widget.enabled ? "text-emerald-400" : "text-vantare-textDim"}`}>
                {widget.enabled ? "Activo" : "Oculto"}
              </span>
            </button>
          );
        })}

        {filteredWidgets.length === 0 && (
          <p className="rounded-lg border border-white/5 bg-black/20 px-3 py-4 text-center text-xs text-vantare-textDim">
            Sin widgets
          </p>
        )}
      </div>
    </aside>
  );
}
