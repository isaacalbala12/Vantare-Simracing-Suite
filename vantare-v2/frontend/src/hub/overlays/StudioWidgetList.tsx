import { useMemo, useState, useRef } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { WidgetConfig } from "../../lib/profile";
import { WIDGET_TYPES } from "../../lib/widget-factory";

type StudioWidgetListProps = {
  widgets: WidgetConfig[];
  selectedWidgetId: string | null;
  onSelectWidget: (id: string) => void;
  onAddWidget?: (type: string) => void;
};

export function StudioWidgetList({ widgets, selectedWidgetId, onSelectWidget, onAddWidget }: StudioWidgetListProps) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<"all" | "active">("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

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
    <aside className="flex min-h-0 flex-col rounded-lg border border-white/5 bg-vantare-panel/70">
      <div className="border-b border-white/5 p-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[11px] font-bold uppercase tracking-widest text-white">
            {t("studio.widgets")}
          </h2>
          <span className="font-mono text-[10px] text-vantare-textDim">{widgets.length}</span>
        </div>

        <div className="mt-2 flex gap-1 rounded-md border border-white/5 bg-black/40 p-0.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
            className={`flex-1 rounded py-1 font-mono text-[10px] font-bold uppercase tracking-widest cursor-pointer ${
              filter === "all" ? "bg-white/10 text-white" : "text-vantare-textMuted hover:text-white"
            }`}
          >
            {t("studio.filterAll")}
          </button>
          <button
            type="button"
            onClick={() => setFilter("active")}
            aria-pressed={filter === "active"}
            className={`flex-1 rounded py-1 font-mono text-[10px] font-bold uppercase tracking-widest cursor-pointer ${
              filter === "active" ? "bg-white/10 text-white" : "text-vantare-textMuted hover:text-white"
            }`}
          >
            {t("studio.filterActive")}
          </button>
        </div>

        <div className="relative mt-2">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-vantare-textDim"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("studio.searchPlaceholder")}
            className="w-full rounded-md border border-white/10 bg-black/40 py-1.5 pl-7 pr-3 font-mono text-[11px] text-white outline-none placeholder:text-vantare-textDim focus:border-vantare-borderHover"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5">
        {filteredWidgets.map((widget) => {
          const selected = selectedWidgetId === widget.id;
          return (
            <button
              key={widget.id}
              type="button"
              onClick={() => onSelectWidget(widget.id)}
              aria-pressed={selected}
              className={`mb-1 flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                selected
                  ? "border-vantare-red-500/40 bg-vantare-red-950/30 text-white"
                  : "border-transparent text-vantare-textMuted hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    selected
                      ? "bg-vantare-red-500 shadow-[0_0_6px_var(--v-red-500)]"
                      : "bg-transparent"
                  }`}
                />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[11px] font-bold">
                    {widget.name || widget.id}
                  </span>
                  <span className="block font-mono text-[9px] uppercase tracking-widest text-vantare-textDim">
                    {widget.type}
                  </span>
                </span>
              </span>
              <span
                className={`shrink-0 font-mono text-[9px] font-bold uppercase tracking-widest ${
                  widget.enabled ? "text-emerald-400" : "text-vantare-textDim"
                }`}
              >
                {widget.enabled ? t("studio.widgetStatus.active") : t("studio.widgetStatus.hidden")}
              </span>
            </button>
          );
        })}

        {filteredWidgets.length === 0 && (
          <p className="rounded-md border border-white/5 bg-black/30 px-2 py-3 text-center font-mono text-[10px] uppercase tracking-widest text-vantare-textDim">
            {t("studio.noWidgets")}
          </p>
        )}
      </div>

      {onAddWidget && (
        <div className="border-t border-white/5 p-2 bg-black/20 flex-none mt-auto">
          {adding ? (
            <div className="flex gap-2 items-center" data-testid="studio-add-widget-form">
              <select
                ref={selectRef}
                className="flex-1 bg-black/50 border border-white/10 rounded px-2 py-1 font-mono text-[10px] text-white outline-none focus:border-vantare-borderHover"
                defaultValue="pedals"
              >
                {WIDGET_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-vantare-bg text-white">
                    {t}
                  </option>
                ))}
              </select>
              <button
                key="confirm"
                type="button"
                data-testid="studio-confirm-add-widget"
                onClick={() => {
                  if (selectRef.current?.value) {
                    onAddWidget(selectRef.current.value);
                    setAdding(false);
                  }
                }}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-mono text-[10px] font-bold px-2.5 py-1 rounded cursor-pointer transition-colors"
              >
                +
              </button>
              <button
                key="cancel"
                type="button"
                data-testid="studio-cancel-add-widget"
                onClick={() => setAdding(false)}
                className="border border-white/10 hover:bg-white/5 text-vantare-textMuted hover:text-white font-mono text-[10px] px-2.5 py-1 rounded cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="studio-show-add-widget"
              onClick={() => setAdding(true)}
              className="w-full border border-dashed border-white/10 hover:border-white/20 rounded py-1.5 text-center font-mono text-[10px] uppercase tracking-widest text-vantare-textDim hover:text-white transition-colors cursor-pointer"
            >
              {t("studio.addWidget")}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
