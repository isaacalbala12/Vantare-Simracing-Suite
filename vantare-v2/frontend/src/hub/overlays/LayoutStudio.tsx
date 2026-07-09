import type { ProfileConfig } from "../../lib/profile";
import type { SaveState } from "./useOverlayStudioState";
import { StudioWidgetList } from "./StudioWidgetList";
import { PreviewCanvas } from "../preview/PreviewCanvas";
import { WidgetSettingsPanel } from "./WidgetSettingsPanel";
import {
  applyOfficialDesignToProfile,
  getOfficialDesign,
  listOfficialDesigns,
  getActiveOfficialDesignId,
  resetWidgetDesignToBase,
} from "../widgets/widget-design-gallery";
import { isSyntheticProfile } from "./widget-studio-empty-profile";

type LayoutStudioProps = {
  profile: ProfileConfig;
  selectedWidgetId: string | null;
  dirty: boolean;
  saveState: SaveState;
  overlayRunning: boolean;
  isActiveProfile: boolean;
  onStartOverlay: () => void;
  onStopOverlay: () => void;
  onSelectWidget: (id: string | null) => void;
  onChangeProfile: (profile: ProfileConfig) => void;
  onAddWidget?: (type: string) => void;
  onSave: () => void;
  onBack: () => void;
};

export function LayoutStudio({
  profile,
  selectedWidgetId,
  dirty,
  saveState,
  overlayRunning,
  isActiveProfile,
  onStartOverlay,
  onStopOverlay,
  onSelectWidget,
  onChangeProfile,
  onAddWidget,
  onSave,
  onBack,
}: LayoutStudioProps) {
  const selectedWidget = profile.widgets.find((widget) => widget.id === selectedWidgetId) ?? null;
  const activeDesignId = selectedWidget ? getActiveOfficialDesignId(selectedWidget) : null;
  const isSynthetic = isSyntheticProfile(profile);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col overflow-hidden px-6 py-5">
      {!isActiveProfile && (
        <div className="mb-3 rounded-lg border border-yellow-900/30 bg-yellow-950/20 px-4 py-2 text-xs text-yellow-300">
          Este perfil no es el activo. Los atajos globales y "Abrir overlay" usarán el perfil activo.
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
          >
            ← Volver a Overlays Studio
          </button>
          <h1 className="font-display text-3xl font-bold text-white">Perfiles Específicos</h1>
          <p className="mt-1 text-sm text-vantare-textMuted">
            Editando la colocación y visibilidad de los widgets para el perfil activo.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-vantare-textMuted">
            {saveState === "saving" && "Guardando..."}
            {saveState === "saved" && "Guardado"}
            {saveState === "error" && "Error al guardar"}
            {saveState === "idle" && dirty && "Cambios sin guardar"}
          </span>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saveState === "saving"}
            className="btn-secondary rounded-lg px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            Guardar
          </button>
          {overlayRunning ? (
            <button
              type="button"
              onClick={onStopOverlay}
              className="btn-secondary rounded-lg px-4 py-2 text-xs font-bold text-white cursor-pointer"
            >
              Detener overlay
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartOverlay}
              disabled={dirty || saveState === "saving"}
              className="btn-primary rounded-lg px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              Abrir overlay
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-none items-center gap-2 border-b border-white/5 px-3 py-2" data-testid="design-system-selector">
        <label
          htmlFor="design-system-select-layout"
          className="font-mono text-[10px] font-bold uppercase tracking-widest text-vantare-textDim"
        >
          Diseño
        </label>
        <select
          id="design-system-select-layout"
          value={activeDesignId ?? "base"}
          disabled={isSynthetic}
          title={isSynthetic ? "Crea o activa un perfil para aplicar diseños" : undefined}
          onChange={(e) => {
            const value = e.target.value;
            if (!selectedWidget) return;
            if (value === "base") {
              onChangeProfile(resetWidgetDesignToBase(profile, selectedWidget.id));
              return;
            }
            const design = getOfficialDesign(value);
            if (design) onChangeProfile(applyOfficialDesignToProfile(profile, selectedWidget.id, design));
          }}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10px] text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        >
          <option value="base">Base</option>
          {selectedWidget
            ? listOfficialDesigns(selectedWidget.type).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))
            : null}
        </select>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto xl:grid-cols-[280px_1fr_340px] xl:overflow-hidden">
        <StudioWidgetList
          widgets={profile.widgets}
          selectedWidgetId={selectedWidget?.id ?? null}
          onSelectWidget={onSelectWidget}
          onAddWidget={onAddWidget}
        />
        <PreviewCanvas
          profile={profile}
          selectedWidgetId={selectedWidget?.id ?? null}
          onSelectWidget={onSelectWidget}
          onChangeProfile={onChangeProfile}
        />
        {selectedWidget ? (
          <WidgetSettingsPanel
            profile={profile}
            widget={selectedWidget}
            onChangeProfile={onChangeProfile}
          />
        ) : (
          <div className="glass-panel flex h-full items-center justify-center rounded-xl text-sm text-vantare-textMuted">
            Selecciona un widget para editar
          </div>
        )}
      </div>
    </div>
  );
}
