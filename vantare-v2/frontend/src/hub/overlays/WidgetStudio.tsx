import type { ProfileConfig } from "../../lib/profile";
import type { SaveState } from "./useOverlayStudioState";
import { StudioWidgetList } from "./StudioWidgetList";
import { WidgetPreviewPanel } from "./WidgetPreviewPanel";
import { WidgetSettingsPanel } from "./WidgetSettingsPanel";

type WidgetStudioProps = {
  profile: ProfileConfig;
  selectedWidgetId: string | null;
  dirty: boolean;
  saveState: SaveState;
  onSelectWidget: (id: string) => void;
  onChangeProfile: (profile: ProfileConfig) => void;
  onSave: () => void;
  onBack: () => void;
};

export function WidgetStudio({
  profile,
  selectedWidgetId,
  dirty,
  saveState,
  onSelectWidget,
  onChangeProfile,
  onSave,
  onBack,
}: WidgetStudioProps) {
  const selectedWidget = profile.widgets.find((widget) => widget.id === selectedWidgetId) ?? profile.widgets[0] ?? null;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden px-6 py-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
          >
            ← Volver a Overlays Studio
          </button>
          <h1 className="font-display text-3xl font-bold text-white">Widgets</h1>
          <p className="mt-1 text-sm text-vantare-textMuted">
            Estos cambios se guardan en el perfil activo.
          </p>
          <p className="mt-1 text-xs text-vantare-textDim">
            La colocación de widgets se editará en Perfiles específicos.
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
        </div>
      </div>

      <div
        data-testid="widget-studio-grid"
        className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[280px_1fr_340px] lg:grid-rows-[1fr] lg:overflow-hidden"
      >
        <StudioWidgetList
          widgets={profile.widgets}
          selectedWidgetId={selectedWidget?.id ?? null}
          onSelectWidget={onSelectWidget}
        />
        <WidgetPreviewPanel profile={profile} activeWidget={selectedWidget} />
        <WidgetSettingsPanel
          profile={profile}
          widget={selectedWidget}
          onChangeProfile={onChangeProfile}
        />
      </div>
    </div>
  );
}
