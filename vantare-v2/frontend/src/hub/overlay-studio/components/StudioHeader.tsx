import { useState } from "react";
import type { SessionLayoutType } from "../../../overlay/core/profile-document";
import { useStudioDocument } from "../state/studio-store";

export type StudioProfileEntry = {
  id: string;
  name: string;
  file: string;
};

const SESSION_OPTIONS: Array<{ value: SessionLayoutType; label: string }> = [
  { value: "general", label: "General" },
  { value: "practice", label: "Práctica" },
  { value: "qualifying", label: "Clasificación" },
  { value: "race", label: "Carrera" },
  { value: "endurance", label: "Resistencia" },
];

export type StudioHeaderProps = {
  profiles: StudioProfileEntry[];
  activeFile: string;
  onRequestProfileChange: (file: string) => void;
  onOpenManageProfiles: () => void;
  onOpenRecommended: () => void;
  onOpenCommunity: () => void;
  onOpenObs: () => void;
};

function saveStatusLabel(saveState: string, dirty: boolean): string {
  if (saveState === "saving") return "Guardando...";
  if (saveState === "saved") return "Guardado";
  if (saveState === "error") return "Error al guardar";
  if (saveState === "conflict") return "Conflicto de revisión";
  if (dirty) return "Cambios sin guardar";
  return "Sin cambios";
}

export function StudioHeader({
  profiles,
  activeFile,
  onRequestProfileChange,
  onOpenManageProfiles,
  onOpenRecommended,
  onOpenCommunity,
  onOpenObs,
}: StudioHeaderProps): React.ReactElement {
  const {
    dirty,
    canUndo,
    canRedo,
    saveState,
    activeSession,
    selectSession,
    save,
    undo,
    redo,
  } = useStudioDocument();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="osv3-header" data-testid="studio-header">
      <div className="osv3-header__left">
        <select
          data-testid="studio-profile-select"
          className="osv3-header__profile-select"
          value={activeFile}
          onChange={(event) => onRequestProfileChange(event.target.value)}
          aria-label="Perfil activo"
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.file}>
              {profile.name}
            </option>
          ))}
        </select>
        <select
          data-testid="studio-session-select"
          className="osv3-header__session-select"
          value={activeSession}
          onChange={(event) => selectSession(event.target.value as SessionLayoutType)}
          aria-label="Sesión de layout"
        >
          {SESSION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="osv3-header__status" data-testid="studio-save-status">
          {saveStatusLabel(saveState, dirty)}
        </span>
      </div>
      <div className="osv3-header__right">
        <button
          type="button"
          data-testid="studio-save-button"
          className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          disabled={!dirty || saveState === "saving"}
          onClick={() => void save()}
        >
          Guardar
        </button>
        <button
          type="button"
          data-testid="studio-undo-button"
          className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          disabled={!canUndo}
          onClick={undo}
        >
          Deshacer
        </button>
        <button
          type="button"
          data-testid="studio-redo-button"
          className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          disabled={!canRedo}
          onClick={redo}
        >
          Rehacer
        </button>
        <div className="osv3-header__menu">
          <button
            type="button"
            data-testid="studio-menu-button"
            className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menú
          </button>
          {menuOpen ? (
            <div className="osv3-header__menu-panel" data-testid="studio-menu-panel">
              <button type="button" className="osv3-header__menu-item" onClick={onOpenManageProfiles}>
                Gestionar perfiles
              </button>
              <button type="button" className="osv3-header__menu-item" onClick={onOpenRecommended}>
                Recomendados
              </button>
              <button type="button" className="osv3-header__menu-item" onClick={onOpenCommunity}>
                Comunidad
              </button>
              <button type="button" className="osv3-header__menu-item" onClick={onOpenObs}>
                OBS
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}