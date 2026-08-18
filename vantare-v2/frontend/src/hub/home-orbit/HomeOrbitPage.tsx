import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { Button, Chip, CountdownDial, Featured, Icon, Kbd, ListRow, Surface } from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { formatStartTime } from "../orbit/next-starts";
import type { RaceStart } from "../orbit/race-starts";
import type { OrbitOverlayState } from "../orbit/use-overlay-state";
import type { SimStatus, ViewId } from "../orbit/views";
import { profileLabel, type ProfileEntry } from "../state/overlay-workbench";
import { greetingSlot } from "./greeting";
import { HomeMiniStage } from "./HomeMiniStage";
import "../../styles/orbit-home.css";

/** `06 · Inicio`: la lista inferior muestra cuatro salidas. */
const RACE_ROWS = 4;

/** Alto compacto (`03 · 3.6`). Se resuelve en JS porque el dial es un tamaño,
 *  no una regla CSS: el kit expone 236 y 200 como variantes discretas. */
const COMPACT_HEIGHT = 940;

export interface HomeOrbitPageProps {
  overlay: OrbitOverlayState;
  /** Próximas salidas reales del calendario del hub. */
  races: RaceStart[];
  /** Objetivo del dial: primera salida seguida, si no la primera de todas. */
  target: RaceStart | null;
  simStatus: SimStatus;
  userName?: string;
  onNavigate(view: ViewId, target?: string): void;
  onOpenPalette(): void;
  onToggleOverlay(): void;
  onActivateProfile(profile: ProfileEntry): void;
  /** Reloj inyectable: sin él el saludo usa la hora local real. */
  now?: Date;
  /** Compacto forzado en test; sin él lo decide el alto de la ventana. */
  compact?: boolean;
}

/** Tick del perfil activo: el sprite Orbit no lleva icono de confirmación. */
function TickMark() {
  return (
    <svg
      aria-hidden="true"
      className="orbit-home__tick"
      fill="none"
      focusable="false"
      height={16}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 16 16"
      width={16}
    >
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

function useCompact(forced?: boolean): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.innerHeight <= COMPACT_HEIGHT,
  );
  useEffect(() => {
    if (forced !== undefined) return;
    const onResize = () => setCompact(window.innerHeight <= COMPACT_HEIGHT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [forced]);
  return forced ?? compact;
}

/**
 * Inicio de Command Orbit (`15-briefings/03-inicio.md`).
 *
 * Hero de comando + dial de la próxima salida, focal del perfil activo con sus
 * widgets reales y rejilla de 12 con próximas carreras y perfiles. Todo el
 * estado de overlay viene de `use-overlay-state` y todas las salidas de
 * `use-calendar-starts`: la página no tiene fuentes propias.
 */
export function HomeOrbitPage({
  overlay,
  races,
  target,
  simStatus,
  userName,
  onNavigate,
  onOpenPalette,
  onToggleOverlay,
  onActivateProfile,
  now,
  compact: forcedCompact,
}: HomeOrbitPageProps) {
  const { t } = useI18n();
  const compact = useCompact(forcedCompact);
  const active = overlay.active;
  const rows = useMemo(() => races.slice(0, RACE_ROWS), [races]);

  const greeting = formatMessage(t(`home.greeting.${greetingSlot(now ?? new Date())}`), {
    name: userName?.trim() || t("home.greeting.fallbackName"),
  });

  const widgetNames = active?.previewDocument?.layouts.general?.widgets
    ?.map((widget) => widget.name ?? widget.type)
    .join(", ");

  return (
    <div className="orbit-home" data-compact={compact ? "true" : undefined} data-testid="orbit-home">
      <section aria-label={t("home.hero.label")} className="orbit-home__hero">
        <div className="orbit-home__hero-main">
          <h1 className="orbit-home__greet">
            <i aria-hidden="true" className="orbit-home__sim" data-s={simStatus} />
            {greeting}
          </h1>

          <Featured
            aria-label={t("home.command.title")}
            className="orbit-home__command"
            data-testid="orbit-home-command"
            interactive
            onClick={onOpenPalette}
          >
            <span className="orbit-home__command-icon">
              <Icon name="i-comando" size={18} />
            </span>
            <span className="orbit-home__command-copy">
              <b>{t("home.command.title")}</b>
              <span>{t("home.command.example")}</span>
            </span>
            <Kbd keys={["Ctrl", "K"]} />
          </Featured>

          <div className="orbit-home__quick">
            <button className="orbit-home__chip" onClick={() => onNavigate("studio")} type="button">
              {t("home.quick.studio")}
            </button>
            <button className="orbit-home__chip" onClick={onToggleOverlay} type="button">
              {overlay.running ? t("home.quick.overlayStop") : t("home.quick.overlay")}
            </button>
            <button
              className="orbit-home__chip"
              onClick={() => onNavigate("estrategia")}
              type="button"
            >
              {t("home.quick.plan")}
            </button>
            <button
              className="orbit-home__chip"
              onClick={() => onNavigate("launcher")}
              type="button"
            >
              {t("home.quick.launch")}
            </button>
          </div>
        </div>

        <div className="orbit-home__hero-side">
          {target ? (
            <CountdownDial
              eyebrow={t("home.next.eyebrow")}
              intervalMin={target.intervalMin}
              meta={[target.note, target.licenseLabel].filter(Boolean).join(" · ")}
              onOpen={() => onNavigate("carreras", target.seriesId)}
              openLabel={t("home.next.open")}
              prefix={t("home.next.prefix")}
              size={compact ? 200 : 236}
              target={target.at}
              title={[target.name, target.track].filter(Boolean).join(" · ")}
            />
          ) : (
            <p className="orbit-home__empty" data-testid="orbit-home-no-dial">
              {t("home.next.empty")}
            </p>
          )}
        </div>
      </section>

      <div className="orbit-home__grid">
        <Featured className="orbit-home__focal" data-testid="orbit-home-focal">
          <div className="orbit-home__focal-copy">
            <span className="orbit-eyebrow">{t("home.focal.eyebrow")}</span>
            {active ? (
              <>
                <h2>{profileLabel(active)}</h2>
                {widgetNames ? (
                  <p>{formatMessage(t("home.focal.desc"), { widgets: widgetNames })}</p>
                ) : null}
                <span className="orbit-home__meta-row">
                  <span className="orbit-home__meta orbit-home__meta--num">
                    {t("home.focal.canvas")}
                  </span>
                  <span className="orbit-home__meta">
                    {formatMessage(t("home.focal.visible"), { n: active.widgets ?? 0 })}
                  </span>
                  <span
                    className="orbit-home__meta orbit-home__overlay-state"
                    data-s={overlay.running ? "running" : "stopped"}
                    data-testid="orbit-home-overlay-state"
                  >
                    {overlay.running ? t("home.focal.overlayRunning") : t("home.focal.overlayStopped")}
                  </span>
                </span>
                <span className="orbit-home__actions">
                  <Button onClick={() => onNavigate("studio")} variant="primary">
                    {t("home.focal.openStudio")}
                  </Button>
                  <Button
                    data-testid="orbit-home-overlay-toggle"
                    onClick={onToggleOverlay}
                    state={overlay.running ? "running" : "idle"}
                  >
                    {overlay.running ? t("home.focal.stopOverlay") : t("home.focal.openOverlay")}
                  </Button>
                </span>
              </>
            ) : (
              <>
                <h2>{t("home.focal.emptyTitle")}</h2>
                <p>{t("home.focal.empty")}</p>
                <span className="orbit-home__actions">
                  <Button onClick={() => onNavigate("studio")} variant="primary">
                    {t("home.focal.openStudio")}
                  </Button>
                </span>
              </>
            )}
          </div>
          <HomeMiniStage profile={active} />
        </Featured>

        <Surface
          actions={
            <button className="orbit-link" onClick={() => onNavigate("carreras")} type="button">
              {t("home.races.seeAll")}
            </button>
          }
          aria-label={t("home.races.title")}
          className="orbit-home__races"
          fill
          meta={t("home.races.meta")}
          title={t("home.races.title")}
        >
          {rows.length === 0 ? (
            <p className="orbit-home__empty">{t("home.races.empty")}</p>
          ) : (
            <div className="orbit-list" data-testid="orbit-home-races">
              {rows.map((row, index) => (
                <ListRow
                  key={`${row.seriesId}-${row.at.getTime()}`}
                  leading={<span className="orbit-home__time">{formatStartTime(row.at)}</span>}
                  next={index === 0}
                  onClick={() => onNavigate("carreras", row.seriesId)}
                  subtitle={[row.track, row.note].filter(Boolean).join(" · ")}
                  title={row.name}
                  trailing={
                    row.licenseLabel ? (
                      <Chip tier={row.licenseTier}>{row.licenseLabel}</Chip>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
        </Surface>

        <Surface
          actions={
            <button
              className="orbit-link"
              data-testid="orbit-home-profiles-manage"
              onClick={() => onNavigate("studio", "profiles")}
              type="button"
            >
              {t("home.profiles.manage")}
            </button>
          }
          aria-label={t("home.profiles.title")}
          className="orbit-home__profiles"
          fill
          title={t("home.profiles.title")}
        >
          {overlay.profiles.length === 0 ? (
            <p className="orbit-home__empty">{t("home.profiles.empty")}</p>
          ) : (
            <div className="orbit-list" data-testid="orbit-home-profiles">
              {overlay.profiles.map((profile) => {
                const isActive = profile.id === overlay.activeProfileId;
                return (
                  <ListRow
                    key={profile.id}
                    onClick={() => (isActive ? onNavigate("studio") : onActivateProfile(profile))}
                    selected={isActive}
                    subtitle={formatMessage(
                      t(isActive ? "home.profiles.local" : "home.profiles.recommended"),
                      { n: profile.widgets ?? 0 },
                    )}
                    title={profileLabel(profile)}
                    trailing={
                      isActive ? (
                        <span className="orbit-home__active">
                          <TickMark />
                          {t("home.profiles.active")}
                        </span>
                      ) : (
                        <span className="orbit-home__activate">{t("home.profiles.activate")}</span>
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}
