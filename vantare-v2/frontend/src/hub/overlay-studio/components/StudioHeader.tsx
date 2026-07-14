import { useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { SessionLayoutType } from "../../../overlay/core/profile-document";
import { useStudioDocument } from "../state/studio-store";

export type StudioProfileEntry = {
  id: string;
  name: string;
  file: string;
};

const SESSION_OPTIONS: Array<{ value: SessionLayoutType; label: string }> = [
  { value: "general", label: "studio.v3.session.general" },
  { value: "practice", label: "studio.v3.session.practice" },
  { value: "qualifying", label: "studio.v3.session.qualifying" },
  { value: "race", label: "studio.v3.session.race" },
  { value: "endurance", label: "studio.v3.session.endurance" },
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
  if (saveState === "saving") return "studio.v3.saveStatus.saving";
  if (saveState === "saved") return "studio.v3.saveStatus.saved";
  if (saveState === "error") return "studio.v3.saveStatus.error";
  if (saveState === "conflict") return "studio.v3.saveStatus.conflict";
  if (dirty) return "studio.v3.saveStatus.dirty";
  return "studio.v3.saveStatus.clean";
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
  const { t } = useI18n();
  const activeProfileName =
    profiles.find((profile) => profile.file === activeFile)?.name ?? activeFile;

  return (
    <header className="osv3-header" data-testid="studio-header">
      <div className="osv3-header__heading">
        <div className="osv3-header__breadcrumb" data-testid="studio-page-breadcrumb">
          <span>{t("nav.profiles")}</span>
          <span aria-hidden="true">›</span>
          <span>{activeProfileName}</span>
        </div>
        <h1 className="osv3-header__title" data-testid="studio-page-title">
          {t("studio.v3.header.pageTitle")}
        </h1>
        <p className="osv3-header__description" data-testid="studio-page-description">
          {t("studio.v3.header.pageDescription")}
        </p>
      </div>
      <div className="osv3-header__controls">
        <div className="osv3-header__left">
          <select
            data-testid="studio-profile-select"
            className="osv3-header__profile-select"
            value={activeFile}
            onChange={(event) => onRequestProfileChange(event.target.value)}
            aria-label={t("studio.v3.header.activeProfileAria")}
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
            aria-label={t("studio.v3.header.sessionAria")}
          >
            {SESSION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
          <span className="osv3-header__status" data-testid="studio-save-status">
            {t(saveStatusLabel(saveState, dirty))}
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
            {t("studio.v3.header.save")}
          </button>
          <button
            type="button"
            data-testid="studio-undo-button"
            className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            disabled={!canUndo}
            onClick={undo}
          >
            {t("studio.v3.header.undo")}
          </button>
          <button
            type="button"
            data-testid="studio-redo-button"
            className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            disabled={!canRedo}
            onClick={redo}
          >
            {t("studio.v3.header.redo")}
          </button>
          <div className="osv3-header__menu">
            <button
              type="button"
              data-testid="studio-menu-button"
              className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {t("studio.v3.header.menu")}
            </button>
            {menuOpen ? (
              <div className="osv3-header__menu-panel" data-testid="studio-menu-panel">
                <button type="button" className="osv3-header__menu-item" onClick={onOpenManageProfiles}>
                  {t("studio.v3.header.manageProfiles")}
                </button>
                <button type="button" className="osv3-header__menu-item" onClick={onOpenRecommended}>
                  {t("studio.v3.header.recommended")}
                </button>
                <button type="button" className="osv3-header__menu-item" onClick={onOpenCommunity}>
                  {t("studio.v3.header.community")}
                </button>
                <button type="button" className="osv3-header__menu-item" onClick={onOpenObs}>
                  OBS
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
