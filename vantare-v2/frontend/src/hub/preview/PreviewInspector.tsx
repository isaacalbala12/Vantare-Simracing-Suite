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
};

function numberValue(value: number, onChange: (value: number) => void) {
  return {
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value)),
  };
}

export function PreviewInspector({ profile, widget, onChangeProfile, disabled = false }: PreviewInspectorProps) {
  if (!widget) {
    return (
      <aside className="glass-panel rounded-xl p-5 text-sm text-vantare-textMuted">
        Selecciona un widget en el preview.
      </aside>
    );
  }

  const selectedWidget = widget;
  const appearance: WidgetAppearance = selectedWidget.props?.appearance ?? {};
  const currentStyle = getWidgetStyle(widget);
  const visibleWhen: VisibleWhen | undefined = selectedWidget.visibleWhen;

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

  return (
    <aside className="glass-panel rounded-xl p-5">
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-wider text-vantare-textDim">Widget</div>
        <h2 className="font-display text-xl font-bold text-white">{widget.id}</h2>
        <p className="text-xs font-mono text-vantare-textMuted">{widget.type}</p>
      </div>

      <div className="mb-4">
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
      </div>

      <label className="mb-5 flex items-center gap-2 text-sm text-white">
        <input
          type="checkbox"
          checked={widget.enabled}
          disabled={disabled}
          onChange={(event) => onChangeProfile(setWidgetEnabled(profile, widget.id, event.target.checked))}
        />
        Visible
      </label>

      {/* Visibility rules */}
      <div className="mb-5 space-y-3 border-t border-white/5 pt-4">
        <p className="text-[10px] uppercase tracking-wider text-vantare-textDim">Visibilidad condicional</p>

        <label className="flex flex-col gap-1 text-xs text-vantare-textMuted">
          Visible en boxes
          <select
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-white disabled:opacity-40 text-sm"
            disabled={disabled}
            value={visibleWhen?.inPit === undefined ? "" : visibleWhen.inPit ? "true" : "false"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                const { inPit: _, ...rest } = visibleWhen ?? {};
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
          <legend className="mb-1">Tipo de sesion</legend>
          <div className="flex flex-wrap gap-3">
            {(["practice", "qual", "race", "warmup"] as const).map((st) => {
              const current = visibleWhen?.sessionType ?? [];
              const checked = current.includes(st);
              return (
                <label key={st} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? current.filter((s) => s !== st)
                        : [...current, st];
                      if (next.length === 0) {
                        const { sessionType: _, ...rest } = visibleWhen ?? {};
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
                  {st === "practice" ? "Practica" :
                   st === "qual" ? "Clasif" :
                   st === "race" ? "Carrera" : "Warm-up"}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <label className="text-xs text-vantare-textMuted">
          X
          <input className="mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white disabled:opacity-40" type="number" disabled={disabled} {...numberValue(widget.position.x, (x) => updateRect({ x }))} />
        </label>
        <label className="text-xs text-vantare-textMuted">
          Y
          <input className="mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white disabled:opacity-40" type="number" disabled={disabled} {...numberValue(widget.position.y, (y) => updateRect({ y }))} />
        </label>
        <label className="text-xs text-vantare-textMuted">
          W
          <input className="mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white disabled:opacity-40" type="number" disabled={disabled} {...numberValue(widget.position.w, (w) => updateRect({ w }))} />
        </label>
        <label className="text-xs text-vantare-textMuted">
          H
          <input className="mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white disabled:opacity-40" type="number" disabled={disabled} {...numberValue(widget.position.h, (h) => updateRect({ h }))} />
        </label>
      </div>

      <div className="mb-4">
        <AppearanceEditor
          widgetType={widget.type}
          appearance={appearance}
          disabled={disabled}
          onChange={(next) => onChangeProfile(updateWidgetAppearance(profile, widget.id, next))}
        />
      </div>

      <div className="space-y-3">
        <label className="block text-xs text-vantare-textMuted">
          Opacidad
          <input className="mt-1 w-full disabled:opacity-40" type="range" disabled={disabled} min="0.2" max="1" step="0.05" value={appearance.opacity ?? 1} onChange={(event) => updateAppearance({ opacity: Number(event.target.value) })} />
        </label>
      </div>
    </aside>
  );
}
