import { useCallback, useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import { extractPreset, applyPreset, type WidgetPreset } from "../../lib/widget-presets";
import {
  listPresets,
  savePreset,
  deletePreset,
  renamePreset,
  onPresetSaveError,
  onPresetDeleteError,
  onPresetRenameError,
} from "../../lib/widget-presets-store";

type WidgetPresetSectionProps = {
  profile: ProfileConfig;
  widget: WidgetConfig;
  onChangeProfile: (profile: ProfileConfig) => void;
};

export function WidgetPresetSection({ profile, widget, onChangeProfile }: WidgetPresetSectionProps) {
  const [presets, setPresets] = useState<WidgetPreset[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listPresets(widget.type).then(setPresets).catch(() => setPresets([]));
  }, [widget.type]);

  useEffect(() => {
    refresh();

    // Sincronización reactiva con los cambios en disco/backend
    const unsub = Events.On("presets:changed", () => {
      refresh();
    });

    const unsubSaveError = onPresetSaveError((payload) => {
      setErrorMsg(`Error guardando preset: ${payload.message}`);
    });
    const unsubDeleteError = onPresetDeleteError((payload) => {
      setErrorMsg(`Error eliminando preset: ${payload.message}`);
    });
    const unsubRenameError = onPresetRenameError((payload) => {
      setErrorMsg(`Error renombrando preset: ${payload.message}`);
    });

    return () => {
      unsub();
      unsubSaveError();
      unsubDeleteError();
      unsubRenameError();
    };
  }, [refresh]);

  useEffect(() => {
    if (!errorMsg) return;
    const id = window.setTimeout(() => setErrorMsg(null), 5000);
    return () => window.clearTimeout(id);
  }, [errorMsg]);

  const clearError = useCallback(() => setErrorMsg(null), []);

  const handleSave = useCallback(() => {
    clearError();
    const name = window.prompt("Nombre del preset:");
    if (!name || !name.trim()) return;
    const extracted = extractPreset(widget, profile);
    savePreset({ ...extracted, name: name.trim() });
    refresh();
  }, [clearError, widget, profile, refresh]);

  const handleApply = useCallback(
    (preset: WidgetPreset) => {
      clearError();
      const { widget: newWidget, variant } = applyPreset(widget, preset);
      const widgets = profile.widgets.map((w) => (w.id === widget.id ? newWidget : w));
      let variants = profile.variants ?? [];
      if (variant) {
        const idsToExclude = new Set<string>([variant.id]);
        if (widget.variantId && widget.variantId !== variant.id) {
          idsToExclude.add(widget.variantId);
        }
        variants = variants.filter((v) => !idsToExclude.has(v.id));
        variants = [...variants, variant];
      }
      onChangeProfile({ ...profile, widgets, variants });
    },
    [clearError, widget, profile, onChangeProfile],
  );

  const handleDelete = useCallback(
    (id: string) => {
      clearError();
      deletePreset(id);
      refresh();
    },
    [clearError, refresh],
  );

  const handleRename = useCallback(
    (id: string) => {
      clearError();
      const name = window.prompt("Nuevo nombre:");
      if (!name || !name.trim()) return;
      renamePreset(id, name.trim());
      refresh();
    },
    [clearError, refresh],
  );

  return (
    <div className="border-t border-white/5 p-2" data-testid="widget-preset-section">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-vantare-textDim">
          Presets
        </span>
        <button
          type="button"
          data-testid="preset-save-btn"
          onClick={handleSave}
          className="border border-white/10 hover:bg-white/5 rounded px-2 py-0.5 font-mono text-[10px] text-vantare-textMuted hover:text-white cursor-pointer transition-colors"
        >
          Guardar
        </button>
      </div>
      {errorMsg && (
        <p
          className="font-mono text-[10px] text-red-400/80 py-1"
          data-testid="preset-error-msg"
        >
          {errorMsg}
        </p>
      )}
      {presets.length === 0 ? (
        <p className="font-mono text-[10px] text-vantare-textDim/60 py-1">
          No hay presets para {widget.type}.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {presets.map((preset) => (
            <li
              key={preset.id}
              className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white/5"
            >
              <span className="flex-1 truncate font-mono text-[10px] text-vantare-textMuted">
                {preset.name}
              </span>
              <button
                type="button"
                data-testid={`preset-apply-${preset.id}`}
                onClick={() => handleApply(preset)}
                className="text-emerald-400 hover:text-emerald-300 font-mono text-[10px] cursor-pointer"
                title="Aplicar"
              >
                Aplicar
              </button>
              <button
                type="button"
                data-testid={`preset-rename-${preset.id}`}
                onClick={() => handleRename(preset.id)}
                className="text-vantare-textDim hover:text-white font-mono text-[10px] cursor-pointer"
                title="Renombrar"
              >
                ✎
              </button>
              <button
                type="button"
                data-testid={`preset-delete-${preset.id}`}
                onClick={() => handleDelete(preset.id)}
                className="text-red-400/60 hover:text-red-400 font-mono text-[10px] cursor-pointer"
                title="Eliminar"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
