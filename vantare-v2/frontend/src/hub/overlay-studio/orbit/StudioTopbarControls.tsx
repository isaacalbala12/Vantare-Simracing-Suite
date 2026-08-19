import { useCallback, useEffect } from "react";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../../i18n/I18nProvider";
import { Button, Select } from "../../../ui/orbit";
import { profileTarget } from "../../state/overlay-workbench";
import { useOverlayState } from "../../orbit/use-overlay-state";
import type { StudioProfileEntry } from "../components/StudioHeader";
import { useStudioDocument } from "../state/studio-store";

/** Ancho del selector de perfil en la topbar (`06 § Overlays Studio`). */
const PROFILE_SELECT_WIDTH = 260;

export type StudioTopbarControlsProps = {
  profiles: StudioProfileEntry[];
  activeFile: string;
  onRequestProfileChange(file: string): void;
};

/**
 * Controles del Studio en la topbar de la shell (slot `children` de `Topbar`).
 *
 * El estado de guardado es el real del store (`dirty`/`saveState`), no una
 * copia: `state="dirty"` mientras haya cambios y `"saved"` cuando el store lo
 * confirma. Aqui tambien aterriza `studio:save`, la accion que la paleta de
 * comandos ya emitia sin que nadie la atendiera.
 */
export function StudioTopbarControls(props: StudioTopbarControlsProps): React.ReactElement {
  const { profiles, activeFile, onRequestProfileChange } = props;
  const { t } = useI18n();
  const { dirty, saveState, save } = useStudioDocument();
  const overlay = useOverlayState();

  const runSave = useCallback(() => {
    void save();
  }, [save]);

  useEffect(() => {
    const unsubscribe = Events.On("studio:save", () => runSave());
    return () => unsubscribe?.();
  }, [runSave]);

  const toggleOverlay = useCallback(() => {
    if (overlay.running) {
      Events.Emit("overlay:stop");
      return;
    }
    if (overlay.active) {
      Events.Emit("overlay:start", profileTarget(overlay.active));
      return;
    }
    Events.Emit("overlay:start-active");
  }, [overlay.active, overlay.running]);

  return (
    <div className="orbit-studio-topbar" data-testid="orbit-studio-topbar-controls">
      <Select
        className="orbit-studio-topbar__profile"
        label={t("studio.topbar.profile")}
        onChange={(file) => onRequestProfileChange(file)}
        options={profiles.map((profile) => ({ value: profile.file, label: profile.name }))}
        value={activeFile}
        width={PROFILE_SELECT_WIDTH}
      />
      <Button
        data-testid="orbit-studio-save"
        onClick={runSave}
        state={dirty ? "dirty" : "saved"}
        variant="primary"
      >
        {dirty || saveState === "saving" ? t("studio.topbar.save") : t("studio.topbar.saved")}
      </Button>
      <Button
        data-testid="orbit-studio-overlay-toggle"
        onClick={toggleOverlay}
        state={overlay.running ? "running" : "idle"}
      >
        {overlay.running ? t("studio.topbar.stopOverlay") : t("studio.topbar.openOverlay")}
      </Button>
    </div>
  );
}
