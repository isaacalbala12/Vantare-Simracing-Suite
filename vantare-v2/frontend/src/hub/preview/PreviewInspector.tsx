import { useState } from "react";
import type { ProfileConfig, WidgetConfig, WidgetAppearance, VisibleWhen } from "../../lib/profile";
import {
  setWidgetEnabled,
  setWidgetStyle,
  updateWidgetAppearance,
  updateWidgetPosition,
  setWidgetVisibleWhen,
} from "./profile-editor";
import { StyleSelector } from "./StyleSelector";
import { AppearanceEditor } from "./AppearanceEditor";
import { getDefaultAppearance } from "../state/style-catalog";
import { getWidgetStyle } from "../../lib/profile";

type PreviewInspectorProps = {
  profile: ProfileConfig;
  widget: WidgetConfig | null;
  onChangeProfile: (profile: ProfileConfig) => void;
  onDuplicate?: (widget: WidgetConfig) => void;
  onReset?: (widget: WidgetConfig) => void;
  onDelete?: (id: string) => void;
  disabled?: boolean;
  showPositionControls?: boolean;
  showDangerActions?: boolean;
  showAppearanceControls?: boolean;
};

export function PreviewInspector({
  profile,
  widget,
  onChangeProfile,
  onDuplicate,
  onReset,
  onDelete,
  disabled = false,
  showPositionControls = true,
  showDangerActions = true,
  showAppearanceControls = true,
}: PreviewInspectorProps) {
  const [openSections, setOpenSections] = useState({
    overview: true,
    position: true,
    appearance: true,
    visibility: false,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!widget) {
    return (
      <aside className="glass-panel rounded-xl p-5 text-sm text-vantare-textMuted h-full flex items-center justify-center font-mono">
        Selecciona un widget en el preview.
      </aside>
    );
  }

  const selectedWidget = widget;
  const appearance: WidgetAppearance = selectedWidget.props?.appearance ?? {};
  const currentStyle = getWidgetStyle(widget);
  const visibleWhen: VisibleWhen | undefined = selectedWidget.visibleWhen;
  const widgetName = selectedWidget.name || selectedWidget.id;

  function updateWidget(next: Partial<WidgetConfig>) {
    onChangeProfile({
      ...profile,
      widgets: profile.widgets.map((w) => (w.id === selectedWidget.id ? { ...w, ...next } : w)),
    });
  }

  function updateVisibleWhen(next: VisibleWhen) {
    onChangeProfile(setWidgetVisibleWhen(profile, selectedWidget.id, next));
  }

  function clearVisibleWhen() {
    onChangeProfile(setWidgetVisibleWhen(profile, selectedWidget.id, undefined));
  }

  function updateRect(next: Partial<typeof selectedWidget.position>) {
    onChangeProfile(updateWidgetPosition(profile, selectedWidget.id, { ...selectedWidget.position, ...next }));
  }

  function updateAppearance(next: WidgetAppearance) {
    onChangeProfile(updateWidgetAppearance(profile, selectedWidget.id, next));
  }

  function numericProps(
    value: number,
    onChange: (v: number) => void,
  ) {
    return {
      value,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value)),
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const step = event.shiftKey ? 10 : 8;
          const dir = event.key === "ArrowUp" ? 1 : -1;
          onChange(Math.round((value + dir * step) / 8) * 8);
        }
      },
    };
  }

  return (
    <aside className="glass-panel rounded-xl p-0 h-full flex flex-col overflow-hidden">
      
      {/* Top Title Pane */}
      <div className="p-5 border-b border-white/5 bg-vantare-surface flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[10px] font-semibold text-vantare-textMuted tracking-wider uppercase">Controles del Widget</h2>
          <span className="text-[9px] font-mono text-white/40">{widget.type}</span>
        </div>
        <div className="mt-2 flex gap-3">
          <div className="w-12 h-10 bg-black/50 border border-white/10 rounded flex items-center justify-center">
            <svg className="w-5 h-5 text-vantare-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h3 className="font-display font-bold text-lg text-white leading-tight">{widget.id}</h3>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide ${widget.enabled ? "text-emerald-400 bg-emerald-500/10" : "text-vantare-textDim bg-white/5"}`}>
              {widget.enabled ? "ACTIVO" : "INACTIVO"}
            </span>
          </div>
        </div>
      </div>

      {/* Accordions Content Area */}
      <div className="flex-grow overflow-y-auto pb-4">
        
        {/* Accordion 1: Overview */}
        <div 
          onClick={() => toggleSection("overview")}
          className="border-b border-white/5 bg-white/2 hover:bg-white/4 px-5 py-3 cursor-pointer flex justify-between items-center select-none"
        >
          <span className="text-xs font-semibold text-vantare-text tracking-wide">VISTA GENERAL</span>
          <svg className={`w-4 h-4 text-vantare-textDim transform transition-transform ${openSections.overview ? "" : "-rotate-90"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {openSections.overview && (
          <div className="px-5 py-4 bg-vantare-panel space-y-4">
            <div>
              <label className="block text-xs text-vantare-textMuted">
                Nombre
                <input
                  className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white disabled:opacity-40 text-sm focus:outline-none focus:border-vantare-red-500/50"
                  value={widgetName}
                  disabled={disabled}
                  onChange={(e) => updateWidget({ name: e.target.value })}
                />
              </label>
            </div>
            <div>
              <label className="block text-xs text-vantare-textMuted">
                Actualización (Hz)
                <input
                  className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white disabled:opacity-40 text-sm focus:outline-none focus:border-vantare-red-500/50"
                  type="number"
                  min={1}
                  max={120}
                  value={widget.updateHz ?? 60}
                  disabled={disabled}
                  onChange={(e) => updateWidget({ updateHz: Number(e.target.value) })}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-white select-none cursor-pointer">
              <input
                type="checkbox"
                checked={widget.enabled}
                disabled={disabled}
                onChange={(event) => onChangeProfile(setWidgetEnabled(profile, widget.id, event.target.checked))}
                className="rounded text-vantare-red-500"
              />
              Visible
            </label>
          </div>
        )}

        {showPositionControls && (
          <>
            {/* Accordion 2: Position & Size */}
            <div
              onClick={() => toggleSection("position")}
              className="border-b border-white/5 bg-white/2 hover:bg-white/4 px-5 py-3 cursor-pointer flex justify-between items-center select-none"
            >
              <span className="text-xs font-semibold text-vantare-text tracking-wide">POSICIÓN Y TAMAÑO</span>
              <svg className={`w-4 h-4 text-vantare-textDim transform transition-transform ${openSections.position ? "" : "-rotate-90"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {openSections.position && (
              <div className="px-5 py-4 bg-vantare-panel space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-vantare-textMuted">
                    X (px)
                    <input className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white disabled:opacity-40" type="number" step={8} disabled={disabled} {...numericProps(widget.position.x, (x) => updateRect({ x }))} />
                  </label>
                  <label className="text-xs text-vantare-textMuted">
                    Y (px)
                    <input className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white disabled:opacity-40" type="number" step={8} disabled={disabled} {...numericProps(widget.position.y, (y) => updateRect({ y }))} />
                  </label>
                  <label className="text-xs text-vantare-textMuted">
                    Ancho (W)
                    <input className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white disabled:opacity-40" type="number" step={8} disabled={disabled} {...numericProps(widget.position.w, (w) => updateRect({ w }))} />
                  </label>
                  <label className="text-xs text-vantare-textMuted">
                    Alto (H)
                    <input className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white disabled:opacity-40" type="number" step={8} disabled={disabled} {...numericProps(widget.position.h, (h) => updateRect({ h }))} />
                  </label>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onDuplicate?.(widget)}
                    className="flex-1 rounded-lg border border-white/10 bg-black/25 py-2 text-xs text-white hover:border-white/20 disabled:opacity-40 transition-colors"
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onReset?.(widget)}
                    className="flex-1 rounded-lg border border-white/10 bg-black/25 py-2 text-xs text-white hover:border-white/20 disabled:opacity-40 transition-colors"
                  >
                    Reset posicion
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {showAppearanceControls && (
          <>
            {/* Accordion 3: Appearance */}
            <div 
              onClick={() => toggleSection("appearance")}
              className="border-b border-white/5 bg-white/2 hover:bg-white/4 px-5 py-3 cursor-pointer flex justify-between items-center select-none"
            >
              <span className="text-xs font-semibold text-vantare-text tracking-wide">APARIENCIA</span>
              <svg className={`w-4 h-4 text-vantare-textDim transform transition-transform ${openSections.appearance ? "" : "-rotate-90"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {openSections.appearance && (
              <div className="px-5 py-4 bg-vantare-panel space-y-4">
                <StyleSelector
                  widgetType={widget.type}
                  currentStyle={currentStyle}
                  disabled={disabled}
                  onStyleChange={(styleId) => {
                    const withStyle = setWidgetStyle(profile, widget.id, styleId);
                    const defaults = getDefaultAppearance(widget.type, styleId);
                    onChangeProfile(updateWidgetAppearance(withStyle, widget.id, defaults));
                  }}
                />
                <AppearanceEditor
                  widgetType={widget.type}
                  appearance={appearance}
                  disabled={disabled}
                  onChange={(next) => onChangeProfile(updateWidgetAppearance(profile, widget.id, next))}
                />
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-medium text-vantare-textMuted">Opacidad</label>
                    <span className="text-[10px] font-mono text-white/60">{Math.round((appearance.opacity ?? 1) * 100)}%</span>
                  </div>
                  <input
                    className="w-full disabled:opacity-40 accent-vantare-red-500 h-1 rounded bg-white/10 appearance-none cursor-pointer"
                    type="range"
                    disabled={disabled}
                    min="0.2"
                    max="1"
                    step="0.05"
                    value={appearance.opacity ?? 1}
                    onChange={(event) => updateAppearance({ opacity: Number(event.target.value) })}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Accordion 4: Visibility */}
        <div 
          onClick={() => toggleSection("visibility")}
          className="border-b border-white/5 bg-white/2 hover:bg-white/4 px-5 py-3 cursor-pointer flex justify-between items-center select-none"
        >
          <span className="text-xs font-semibold text-vantare-text tracking-wide">VISIBILIDAD CONDICIONAL</span>
          <svg className={`w-4 h-4 text-vantare-textDim transform transition-transform ${openSections.visibility ? "" : "-rotate-90"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {openSections.visibility && (
          <div className="px-5 py-4 bg-vantare-panel space-y-4">
            <label className="flex flex-col gap-1 text-xs text-vantare-textMuted">
              Visible en boxes
              <select
                className="bg-black/40 border border-white/10 rounded px-2 py-1 text-white disabled:opacity-40 text-sm focus:outline-none focus:border-vantare-red-500"
                disabled={disabled}
                value={visibleWhen?.inPit === undefined ? "" : visibleWhen.inPit ? "true" : "false"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") {
                    const rest = { ...visibleWhen };
                    delete rest.inPit;
                    if (Object.keys(rest).length > 0) {
                      updateVisibleWhen(rest);
                    } else {
                      clearVisibleWhen();
                    }
                  } else {
                    updateVisibleWhen({ ...visibleWhen, inPit: v === "true" });
                  }
                }}
              >
                <option value="">Sin regla</option>
                <option value="true">Solo en boxes</option>
                <option value="false">Solo fuera de boxes</option>
              </select>
            </label>

            <fieldset className="text-xs text-vantare-textMuted">
              <legend className="mb-2">Tipo de sesión</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["practice", "qual", "race", "warmup"] as const).map((st) => {
                  const current = visibleWhen?.sessionType ?? [];
                  const checked = current.includes(st);
                  return (
                    <label key={st} className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? current.filter((s) => s !== st)
                            : [...current, st];
                          if (next.length === 0) {
                            const rest = { ...visibleWhen };
                            delete rest.sessionType;
                            if (Object.keys(rest).length > 0) {
                              updateVisibleWhen(rest);
                            } else {
                              clearVisibleWhen();
                            }
                          } else {
                            updateVisibleWhen({ ...visibleWhen, sessionType: next });
                          }
                        }}
                      />
                      <span>
                        {st === "practice" ? "Práctica" :
                         st === "qual" ? "Clasif" :
                         st === "race" ? "Carrera" : "Warm-up"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>
        )}

      </div>

      {showDangerActions && (
        <div className="p-4 border-t border-white/5 bg-vantare-surface flex-shrink-0">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (window.confirm("¿Eliminar este widget?")) onDelete?.(widget.id);
            }}
            className="w-full rounded-lg border border-vantare-red-500/30 bg-vantare-red-950/20 px-3 py-2 text-xs font-bold text-vantare-red-400 hover:bg-vantare-red-950/40 disabled:opacity-40 transition-colors"
          >
            Eliminar
          </button>
        </div>
      )}

    </aside>
  );
}
