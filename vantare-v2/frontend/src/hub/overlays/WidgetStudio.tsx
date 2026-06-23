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

  const saveLabel =
    saveState === "saving"
      ? "Guardando..."
      : saveState === "saved"
        ? "Guardado"
        : saveState === "error"
          ? "Error al guardar"
          : dirty
            ? "Cambios sin guardar"
            : "Sin cambios";
  const saveAccent = saveState === "error" || (saveState === "idle" && dirty);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-vantare-bg px-4 py-3">
      <div className="mb-2 flex flex-none items-center justify-between gap-4 border-b border-white/5 pb-2">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[10px] font-bold uppercase tracking-widest text-vantare-textMuted transition-colors hover:text-white cursor-pointer"
          >
            ← Overlays Studio
          </button>
          <span className="h-3 w-px bg-white/10" aria-hidden="true" />
          <h1 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-white">
            Widgets
          </h1>
          <span className="hidden font-mono text-[10px] text-vantare-textDim sm:inline">
            Edición interna · sin posición
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest ${
              saveAccent ? "text-vantare-red-400" : "text-vantare-textMuted"
            }`}
            data-testid="widget-studio-save-state"
          >
            <span
              aria-hidden="true"
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                saveAccent
                  ? "bg-vantare-red-500 shadow-[0_0_6px_var(--v-red-500)]"
                  : saveState === "saved"
                    ? "bg-emerald-400"
                    : "bg-vantare-textDim"
              }`}
            />
            {saveLabel}
          </span>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saveState === "saving"}
            className="btn-secondary rounded-md px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            Guardar
          </button>
        </div>
      </div>

      <div
        data-testid="widget-studio-grid"
        className="grid min-h-0 flex-1 gap-3 overflow-y-auto lg:grid-cols-[260px_1fr_360px] lg:grid-rows-[1fr] lg:overflow-hidden"
      >
        <StudioWidgetList
          widgets={profile.widgets}
          selectedWidgetId={selectedWidget?.id ?? null}
          onSelectWidget={onSelectWidget}
        />
        <div className="flex min-h-0 flex-col gap-2">
          {selectedWidget?.type === "standings" ? (
            <div
              className="flex items-center gap-2 border-b border-white/5 pb-2"
              data-testid="mock-session-selector"
            >
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-vantare-textDim">
                Mock
              </span>
              <div className="flex overflow-hidden rounded-md border border-white/10 bg-black/40">
                {[
                  ["practice", "Práctica"],
                  ["qual", "Qualy"],
                  ["race", "Carrera"],
                ].map(([value, label]) => {
                  const active = value === mockSessionScenario;
                  return (
                    <button
                      key={value}
                      type="button"
                      data-testid={`mock-session-${value}`}
                      aria-pressed={active}
                      onClick={() => setMockSessionScenario(value as MockSessionScenario)}
                      className={`border-r border-white/5 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors last:border-r-0 cursor-pointer ${
                        active
                          ? "bg-white/10 text-white"
                          : "text-vantare-textMuted hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
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