import { useState } from "react";
import type { ProfileConfig } from "../../lib/profile";
import type { MockSessionScenario } from "../../overlay/widgets/mock-telemetry";
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
  const [mockSessionScenario, setMockSessionScenario] = useState<MockSessionScenario>("race");

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
        <div className="flex min-h-0 flex-col gap-2">
          {selectedWidget?.type === "standings" ? (
            <div className="flex items-center gap-2 text-xs text-neutral-400" data-testid="mock-session-selector">
              <span className="uppercase tracking-wide text-neutral-500">Mock</span>
              {[
                ["practice", "Práctica"],
                ["qual", "Qualy"],
                ["race", "Carrera"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`mock-session-${value}`}
                  className={
                    value === mockSessionScenario
                      ? "rounded bg-neutral-700 px-2 py-1 font-bold text-white"
                      : "rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-white cursor-pointer"
                  }
                  onClick={() => setMockSessionScenario(value as MockSessionScenario)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <WidgetPreviewPanel profile={profile} activeWidget={selectedWidget} mockSessionScenario={mockSessionScenario} />
        </div>
        <WidgetSettingsPanel
          profile={profile}
          widget={selectedWidget}
          onChangeProfile={onChangeProfile}
        />
      </div>
    </div>
  );
}
