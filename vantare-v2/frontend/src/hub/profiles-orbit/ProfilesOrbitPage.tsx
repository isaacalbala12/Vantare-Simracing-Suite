import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider";
import { Button, Chip, ListRow, Surface } from "../../ui/orbit";
import { useOrbitSlot } from "../orbit/use-orbit-slot";
import { STUDIO_CONTEXT_SLOT_ID } from "../overlay-studio/orbit/studio-orbit-slots";
import { formatMessage } from "../orbit/format-message";
import { HomeMiniStage } from "../home-orbit/HomeMiniStage";
import {
  isActiveProfile,
  isRunningProfile,
  profileLabel,
  type OverlayStatus,
  type ProfileEntry,
} from "../state/overlay-workbench";
import "../../styles/orbit-profiles.css";

export type ProfilesOrbitPageProps = {
  profiles: ProfileEntry[];
  overlayStatus: OverlayStatus | null;
  activeProfileId: string | null;
  onStartOverlay: (profile: ProfileEntry) => void;
  onStopOverlay: () => void;
  onOpenProfile: (profile: ProfileEntry) => void;
  onCreateProfile: () => void;
  onSetActiveProfile: (profile: ProfileEntry) => void;
  onOpenActiveOverlay: () => void;
  onBack: () => void;
};

/**
 * «Mis perfiles» de Overlays Studio con la piel de Command Orbit.
 *
 * Es una capa de presentación pura: recibe exactamente las mismas props que
 * `OwnProfilesView` y despacha las mismas llamadas, así que el store de
 * perfiles, la activación, la creación y el editor de layout siguen siendo los
 * de `StudioRoute`. Con el flag Orbit apagado esta pantalla no se monta.
 */
export function ProfilesOrbitPage({
  profiles,
  overlayStatus,
  activeProfileId,
  onStartOverlay,
  onStopOverlay,
  onOpenProfile,
  onCreateProfile,
  onSetActiveProfile,
  onOpenActiveOverlay,
  onBack,
}: ProfilesOrbitPageProps) {
  const { t } = useI18n();
  // La columna de Studio se queda vacía en modo «Mis perfiles» si nadie la
  // rellena: aquí se porta la misma lista, con el activo marcado y el clic
  // abriendo el editor de layout (auditoría de cableado, D-94).
  const contextSlot = useOrbitSlot(STUDIO_CONTEXT_SLOT_ID);
  const activeExists = activeProfileId !== null && profiles.some((p) => p.id === activeProfileId);

  return (
    <div className="orbit-profiles" data-testid="orbit-profiles">
      {contextSlot
        ? createPortal(
            <div className="orbit-profiles__context">
              <section aria-label={t("profiles.context.title")} className="orbit-block">
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("profiles.context.title")}</span>
                  <span className="orbit-profiles__context-count">{profiles.length}</span>
                </div>
                <div className="orbit-list" data-testid="orbit-profiles-context">
                  {profiles.length === 0 ? (
                    <p className="orbit-row__copy">{t("profiles.context.empty")}</p>
                  ) : (
                    profiles.map((profile) => (
                      <ListRow
                        key={profile.file}
                        onClick={() => onOpenProfile(profile)}
                        selected={isActiveProfile(profile, activeProfileId)}
                        subtitle={formatMessage(t("profiles.context.widgets"), {
                          n: profile.widgets ?? 0,
                        })}
                        title={profileLabel(profile)}
                        trailing={
                          isActiveProfile(profile, activeProfileId) ? (
                            <Chip tone="ok">{t("profiles.chip.active")}</Chip>
                          ) : undefined
                        }
                      />
                    ))
                  )}
                </div>
              </section>
              <p className="orbit-profiles__context-hint">{t("profiles.context.hint")}</p>
            </div>,
            contextSlot,
          )
        : null}

      <header className="orbit-profiles__head">
        <div className="orbit-profiles__head-copy">
          <Button
            className="orbit-profiles__back"
            data-testid="orbit-profiles-back"
            onClick={onBack}
            size="sm"
            variant="ghost"
          >
            {t("profiles.back")}
          </Button>
          <span className="orbit-eyebrow">{t("profiles.eyebrow")}</span>
          <h2>{t("profiles.pageTitle")}</h2>
          <p>{t("profiles.lead")}</p>
        </div>
        <div className="orbit-profiles__head-actions">
          {activeExists ? (
            <Button
              data-testid="orbit-profiles-open-active"
              onClick={onOpenActiveOverlay}
              variant="ghost"
            >
              {t("profiles.openOverlay")}
            </Button>
          ) : null}
          <Button
            data-testid="orbit-profiles-create"
            onClick={onCreateProfile}
            variant="primary"
          >
            {t("profiles.create")}
          </Button>
        </div>
      </header>

      {profiles.length === 0 ? (
        <p className="orbit-profiles__empty" data-testid="orbit-profiles-empty">
          {t("profiles.empty")}
        </p>
      ) : (
        <div className="orbit-profiles__grid" data-testid="orbit-profiles-grid">
          {profiles.map((profile) => {
            const label = profileLabel(profile);
            const active = isActiveProfile(profile, activeProfileId);
            const running = isRunningProfile(profile, overlayStatus);
            return (
              <Surface
                as="article"
                className="orbit-profiles__card"
                data-testid={`orbit-profiles-card-${profile.id}`}
                key={profile.file}
              >
                <div className="orbit-profiles__stage">
                  <HomeMiniStage profile={profile} />
                </div>
                <div className="orbit-profiles__copy">
                  <div className="orbit-profiles__title">
                    <h3>{label}</h3>
                    {active ? (
                      <Chip tone="ok">{t("profiles.chip.active")}</Chip>
                    ) : null}
                    {running ? <Chip tone="accent">{t("profiles.chip.running")}</Chip> : null}
                  </div>
                  <p className="orbit-profiles__meta">
                    {formatMessage(t("profiles.meta"), {
                      mode: profile.displayMode,
                      n: profile.widgets,
                    })}
                  </p>
                </div>
                <div className="orbit-profiles__actions">
                  <Button
                    aria-label={formatMessage(t("profiles.editAria"), { name: label })}
                    data-testid={`orbit-profiles-edit-${profile.id}`}
                    onClick={() => onOpenProfile(profile)}
                    size="sm"
                    variant="ghost"
                  >
                    {t("profiles.edit")}
                  </Button>
                  {active ? (
                    running ? (
                      <Button
                        aria-label={formatMessage(t("profiles.stopAria"), { name: label })}
                        data-testid={`orbit-profiles-stop-${profile.id}`}
                        onClick={onStopOverlay}
                        size="sm"
                        variant="ghost"
                      >
                        {t("profiles.stop")}
                      </Button>
                    ) : (
                      // El perfil activo no se puede «activar» otra vez: el botón
                      // queda deshabilitado con el tick, como pide el briefing.
                      <Button
                        data-testid={`orbit-profiles-activate-${profile.id}`}
                        disabled
                        size="sm"
                        state="saved"
                        variant="ghost"
                      >
                        {t("profiles.activated")}
                      </Button>
                    )
                  ) : (
                    <Button
                      aria-label={formatMessage(t("profiles.activateAria"), { name: label })}
                      data-testid={`orbit-profiles-activate-${profile.id}`}
                      onClick={() => onSetActiveProfile(profile)}
                      size="sm"
                      variant="primary"
                    >
                      {t("profiles.activate")}
                    </Button>
                  )}
                  {active && !running ? (
                    <Button
                      aria-label={formatMessage(t("profiles.startAria"), { name: label })}
                      data-testid={`orbit-profiles-start-${profile.id}`}
                      onClick={() => onStartOverlay(profile)}
                      size="sm"
                      variant="primary"
                    >
                      {t("profiles.openOverlay")}
                    </Button>
                  ) : null}
                </div>
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}
