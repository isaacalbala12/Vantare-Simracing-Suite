import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nProvider";
import {
  Button,
  Chain,
  Chip,
  Featured,
  Input,
  Kbd,
  ListRow,
  Monogram,
  Note,
  StatRow,
  StatTile,
  SubtleStatus,
  Surface,
} from "../../ui/orbit";
import { formatMessage } from "../orbit/format-message";
import { useOrbitSlot } from "../orbit/use-orbit-slot";
import { OrbitAddAppDrawer } from "./OrbitAddAppDrawer";
import { OrbitConfirmDrawer } from "./OrbitConfirmDrawer";
import { OrbitProfileEditor } from "./OrbitProfileEditor";
import type { LaunchProfile } from "../launcher/launcher-contract";
import { appSortOrder, newProfileId, type LauncherAppEntry } from "../launcher/launcher-state";
import {
  useLauncherDiscoveryProgress,
  useLauncherSnapshot,
  useLauncherStore,
} from "../launcher/launcher-store";
import {
  chainSteps,
  detectedCount,
  favoriteApps,
  hotkeyKeys,
  lastLaunchedAt,
  orderCatalogApps,
  orderProfiles,
  policyChips,
  profileInitials,
  toOrbitApp,
  type LauncherOrbitApp,
} from "./launcher-orbit-model";
import { AppChainStep, AppMonogram } from "./AppMonogram";
import "../../styles/orbit-launcher.css";

/** Huecos que la shell reserva para el Launcher (briefing 05). */
import {
  LAUNCHER_CONTEXT_SLOT_ID,
  LAUNCHER_TOPBAR_SLOT_ID,
} from "../components/orbit/orbit-slot-ids";

export { LAUNCHER_CONTEXT_SLOT_ID, LAUNCHER_TOPBAR_SLOT_ID };

/** Lápiz de editar: el sprite Orbit no lo trae (precedente D-47). */
function PencilMark() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={15}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.4}
      viewBox="0 0 16 16"
      width={15}
    >
      <path d="M11.5 2.5l2 2L6 12H4v-2z" />
    </svg>
  );
}

/** Estrella de favorito: el sprite Orbit no la trae (precedente D-47). */
function StarMark({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      focusable="false"
      height={15}
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth={1.4}
      viewBox="0 0 16 16"
      width={15}
    >
      <path d="M8 1.9l1.83 3.86 4.17.6-3 3 .71 4.24L8 11.6l-3.71 2l.71-4.24-3-3 4.17-.6z" />
    </svg>
  );
}

/** Papelera de eliminar aplicación personalizada. */
function TrashMark() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={15}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.4}
      viewBox="0 0 16 16"
      width={15}
    >
      <path d="M2.8 4.3h10.4M6.4 4.3V2.9h3.2v1.4M4.3 4.3l.6 8.2h6.2l.6-8.2M6.7 6.7v3.6M9.3 6.7v3.6" />
    </svg>
  );
}

function formatMoment(value: Date): string {
  return value.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Launcher de Command Orbit (`15-briefings/05-launcher.md`).
 *
 * Catálogo real (`LauncherApp`), perfiles reales (`LaunchProfile`) y cadena
 * real: el botón ▶ despacha `launcher:profile:launch` por el mismo puente que
 * el Launcher clásico y el estado por paso sale de `activeChains` de la
 * instantánea, no de un estado propio de la pantalla.
 */
export function LauncherOrbitPage() {
  const { t } = useI18n();
  const snapshot = useLauncherSnapshot();
  const progress = useLauncherDiscoveryProgress();
  const { dispatchLauncherCommand, discoverApps, subscribeAppPicked } = useLauncherStore();
  const contextSlot = useOrbitSlot(LAUNCHER_CONTEXT_SLOT_ID);
  const topbarSlot = useOrbitSlot(LAUNCHER_TOPBAR_SLOT_ID);
  const [query, setQuery] = useState("");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  // Borrador del perfil recien creado. Sin el, «Crear perfil» no abria nada:
  // el editor se buscaba en la instantanea del store, que solo trae el perfil
  // cuando el backend confirma el guardado, asi que el clic se perdia.
  const [draftProfile, setDraftProfile] = useState<LaunchProfile | null>(null);
  // Alta de aplicacion personalizada y baja confirmada: ambas viven en cajones
  // del kit, nunca en un confirm() nativo.
  const [addingApp, setAddingApp] = useState(false);
  const [appToRemove, setAppToRemove] = useState<LauncherOrbitApp | null>(null);

  // Misma detección real que el Launcher clásico: el store la salta si el
  // último escaneo sigue fresco (TTL), así que entrar aquí no relanza el disco.
  useEffect(() => { discoverApps(); }, [discoverApps]);

  const apps = useMemo(() => snapshot?.apps ?? [], [snapshot]);
  const profiles = useMemo(
    () => orderProfiles(snapshot?.userProfiles ?? [], snapshot?.vantareProfiles ?? []),
    [snapshot],
  );
  const detected = detectedCount(apps);
  const favorites = profiles.filter((profile) => profile.isFavorite).length;

  // El favorito manda en el orden del catalogo: sin esto marcar la estrella no
  // movia nada, porque la instantanea llega ordenada por id.
  const orbitApps = useMemo(() => orderCatalogApps(apps.map(toOrbitApp)), [apps]);
  const favoriteCatalogApps = useMemo(() => favoriteApps(orbitApps), [orbitApps]);
  const visibleApps = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return orbitApps;
    return orbitApps.filter(
      (app) =>
        app.name.toLowerCase().includes(needle) ||
        app.abbreviation.toLowerCase().includes(needle),
    );
  }, [orbitApps, query]);

  // El editor legado trabaja con `LauncherAppEntry` (contrato previo a
  // `availability`): se reutiliza tal cual y se le adapta la lista aquí.
  const editorApps = useMemo<LauncherAppEntry[]>(
    () =>
      apps
        .map((app) => ({ ...app, detected: app.detected ?? app.availability?.found === true }))
        .sort(appSortOrder),
    [apps],
  );
  const editingProfile = editingProfileId
    ? profiles.find((profile) => profile.id === editingProfileId) ??
      (draftProfile?.id === editingProfileId ? draftProfile : null)
    : null;

  const discovery = snapshot?.discovery;
  const scanning = progress?.scanning === true || discovery?.scanning === true;
  // Antes de que llegue la instantanea no hay catalogo que ensenar, y decir
  // «sin aplicaciones» seria mentir: mientras se espera van filas de relleno.
  const awaitingApps = snapshot === null || (scanning && apps.length === 0);
  const discoveryLabel = scanning
    ? t("launcher.discovery.scanning")
    : discovery?.error
      ? t("launcher.discovery.error")
      : discovery?.lastScanAt
        ? formatMessage(t("launcher.discovery.done"), {
            when: formatMoment(new Date(discovery.lastScanAt)),
          })
        : t("launcher.discovery.notRun");
  const discoveryTone = scanning ? "attn" : discovery?.error ? "attn" : discovery?.lastScanAt ? "ok" : "neutral";

  // La nota de «estado neutral» explica por qué nada aparece como instalado
  // *antes* de la primera detección. Una vez ejecutada deja de ser cierta y
  // estorba: en su lugar la cabecera del catálogo fecha el último escaneo.
  const detectionRan = Boolean(discovery?.lastScanAt);
  const catalogMeta = detectionRan
    ? formatMessage(t("launcher.catalog.detectionMeta"), {
        when: formatMoment(new Date(discovery!.lastScanAt as string)),
        n: detected,
      })
    : formatMessage(t("launcher.catalog.count"), { n: apps.length });

  const lastRun = lastLaunchedAt(profiles);
  const featured = profiles[0] ?? null;
  const keys = hotkeyKeys(featured?.hotkey);

  const launch = (profileId: string) =>
    dispatchLauncherCommand("launcher:profile:launch", { id: profileId });

  // El favorito se persiste en el backend Go (`SetLauncherAppFavorite` sobre
  // los ajustes de la aplicacion), igual que el resto del estado del launcher:
  // la pantalla no guarda nada por su cuenta y espera a la instantanea.
  const toggleFavorite = (app: LauncherOrbitApp) =>
    dispatchLauncherCommand("launcher:app:favorite", { id: app.id, favorite: !app.isFavorite });

  const create = () => {
    const id = newProfileId("profile");
    const blank: LaunchProfile = {
      id,
      name: t("launcher.profiles.newPlaceholder"),
      description: "",
      steps: [],
    };
    // El borrador se guarda en local **antes** de despachar: el editor abre en
    // el mismo clic y deja de depender de que el backend devuelva el perfil.
    setDraftProfile(blank);
    setEditingProfileId(id);
    dispatchLauncherCommand("launcher:profile:save", { profile: blank });
  };

  const renderProfile = (profile: LaunchProfile, isFeatured: boolean) => {
    const chain = snapshot?.activeChains?.find((entry) => entry.profileId === profile.id);
    const steps = chainSteps(profile, apps, chain);
    const policies = policyChips(profile.policy);
    const initials = profileInitials(profile.name);
    const body = (
      <>
        <div className="orbit-launcher__profile-top">
          <Monogram
            g1={isFeatured ? "#ff6a5f" : "#5ccbd5"}
            g2={isFeatured ? "#d52f49" : "#2a5b8f"}
            size={46}
            text={initials}
          />
          <div className="orbit-launcher__profile-copy">
            <span className="orbit-eyebrow">
              {t(isFeatured ? "launcher.profile.featuredEyebrow" : "launcher.profile.eyebrow")}
            </span>
            <h4>{profile.name}</h4>
            {profile.description ? <p>{profile.description}</p> : null}
          </div>
          <div className="orbit-launcher__profile-actions">
            <button
              aria-label={formatMessage(t("launcher.profile.editAria"), { name: profile.name })}
              className="orbit-icon-btn orbit-icon-btn--28"
              data-tip={formatMessage(t("launcher.profile.editAria"), { name: profile.name })}
              data-tip-side="top"
              onClick={() => setEditingProfileId(profile.id)}
              type="button"
            >
              <PencilMark />
            </button>
            <Button
              data-testid={`orbit-launcher-run-${profile.id}`}
              onClick={() => launch(profile.id)}
              variant={isFeatured ? "primary" : "ghost"}
            >
              {t("launcher.profile.launch")}
            </Button>
          </div>
        </div>

        {steps.length === 0 ? (
          <p className="orbit-launcher__empty">{t("launcher.profile.noSteps")}</p>
        ) : (
          <Chain
            className="orbit-launcher__chain"
            label={formatMessage(t("launcher.profile.chainLabel"), { name: profile.name })}
          >
            {steps.map((step, index) => (
              <AppChainStep
                abbreviation={step.abbreviation}
                app={{
                  id: step.appId,
                  executablePath: step.executablePath,
                  userExecutablePath: step.userExecutablePath,
                  iconOverridePath: step.iconOverridePath,
                  iconUrl: step.iconUrl,
                }}
                g1={step.g1}
                g2={step.g2}
                key={`${step.appId}-${index}`}
                name={step.name}
                status={step.status}
                statusLabel={
                  step.status === "pending" ? undefined : t(`launcher.step.status.${step.status}`)
                }
                wait={
                  step.delay > 0
                    ? formatMessage(t("launcher.profile.delay"), { s: step.delay })
                    : t("launcher.profile.noWait")
                }
              />
            ))}
          </Chain>
        )}

        {policies.length > 0 ? (
          <div className="orbit-launcher__policies">
            {policies.map((policy) => (
              <Chip key={policy.key}>
                {formatMessage(t(policy.key), policy.params ?? {})}
              </Chip>
            ))}
          </div>
        ) : null}
      </>
    );

    if (isFeatured) {
      return (
        <Featured
          className="orbit-launcher__profile orbit-launcher__profile--featured"
          data-testid={`orbit-launcher-profile-${profile.id}`}
          key={profile.id}
        >
          {body}
        </Featured>
      );
    }
    return (
      <article
        className="orbit-launcher__profile"
        data-testid={`orbit-launcher-profile-${profile.id}`}
        key={profile.id}
      >
        {body}
      </article>
    );
  };

  return (
    <div className="orbit-launcher" data-testid="orbit-launcher">
      {topbarSlot
        ? createPortal(
            <div className="orbit-launcher__search">
              <Input
                aria-label={t("launcher.search")}
                data-testid="orbit-launcher-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("launcher.search")}
                type="search"
                value={query}
              />
            </div>,
            topbarSlot,
          )
        : null}

      {contextSlot
        ? createPortal(
            <div className="orbit-launcher__context">
              <section
                aria-label={formatMessage(t("launcher.context.profiles"), { n: profiles.length })}
                className="orbit-block"
              >
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("launcher.context.profilesTitle")}</span>
                  <span className="orbit-launcher__context-count">{profiles.length}</span>
                </div>
                <div className="orbit-list" data-testid="orbit-launcher-context-profiles">
                  {profiles.length === 0 ? (
                    <p className="orbit-row__copy">{t("launcher.context.noProfiles")}</p>
                  ) : (
                    profiles.map((profile) => (
                      <ListRow
                        key={profile.id}
                        leading={
                          <Monogram
                            g1={profile.isFavorite ? "#ff6a5f" : "#5ccbd5"}
                            g2={profile.isFavorite ? "#d52f49" : "#2a5b8f"}
                            size={32}
                            text={profileInitials(profile.name)}
                          />
                        }
                        onClick={() => launch(profile.id)}
                        subtitle={
                          // La referencia encadena nombres completos, no
                          // abreviaturas: «LMU → OBS → Spotify».
                          chainSteps(profile, apps)
                            .map((step) => step.name)
                            .join(" → ") ||
                          formatMessage(t("launcher.context.steps"), { n: 0 })
                        }
                        title={profile.name}
                        trailing={
                          <span aria-hidden="true" className="orbit-play">
                            ▶
                          </span>
                        }
                      />
                    ))
                  )}
                </div>
              </section>

              <section
                aria-label={formatMessage(t("launcher.context.favorites"), {
                  n: favoriteCatalogApps.length,
                })}
                className="orbit-block"
              >
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("launcher.context.favoritesTitle")}</span>
                  <span className="orbit-launcher__context-count">
                    {favoriteCatalogApps.length}
                  </span>
                </div>
                <div className="orbit-list" data-testid="orbit-launcher-context-favorites">
                  {favoriteCatalogApps.length === 0 ? (
                    <p className="orbit-row__copy">{t("launcher.context.noFavorites")}</p>
                  ) : (
                    favoriteCatalogApps.map((app) => (
                      <ListRow
                        key={app.id}
                        leading={
                          <AppMonogram
                            app={app}
                            g1={app.g1}
                            g2={app.g2}
                            size={32}
                            text={app.abbreviation}
                          />
                        }
                        subtitle={t(app.categoryKey)}
                        title={app.name}
                      />
                    ))
                  )}
                </div>
              </section>

              <section
                aria-label={formatMessage(t("launcher.context.catalog"), {
                  n: apps.length,
                  detected,
                })}
                className="orbit-block"
              >
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("launcher.context.catalogTitle")}</span>
                  <span className="orbit-launcher__context-count">
                    {formatMessage(t("launcher.context.catalogCount"), {
                      n: apps.length,
                      detected,
                    })}
                  </span>
                </div>
                <p className="orbit-launcher__context-hint">{t("launcher.context.hint")}</p>
              </section>
            </div>,
            contextSlot,
          )
        : null}

      <header className="orbit-launcher__head">
        <div className="orbit-launcher__head-copy">
          <span className="orbit-eyebrow">{t("launcher.eyebrow")}</span>
          <h2>{t("launcher.pageTitle")}</h2>
          <p>{t("launcher.lead")}</p>
        </div>
        <SubtleStatus className="orbit-launcher__discovery" tone={discoveryTone}>
          {discoveryLabel}
        </SubtleStatus>
      </header>

      <StatRow className="orbit-launcher__stats">
        <StatTile
          label={t("launcher.stats.apps")}
          sub={
            detected > 0
              ? formatMessage(t("launcher.stats.detected"), { n: detected })
              : `${formatMessage(t("launcher.stats.detected"), { n: 0 })} · ${t("launcher.stats.runScan")}`
          }
          unit={t("launcher.stats.inCatalog")}
          value={apps.length}
        />
        <StatTile
          label={t("launcher.stats.profiles")}
          sub={formatMessage(
            t(favorites === 1 ? "launcher.stats.profilesSubOne" : "launcher.stats.profilesSub"),
            { favorites },
          )}
          unit={t("launcher.stats.chains")}
          value={profiles.length}
        />
        <StatTile
          label={t("launcher.stats.lastRun")}
          sub={lastRun ? "" : t("launcher.stats.lastRunNone")}
          value={lastRun ? formatMoment(lastRun) : "—"}
        />
        <StatTile
          label={t("launcher.stats.hotkey")}
          sub={keys.length > 0 ? t("launcher.stats.hotkeyHint") : t("launcher.stats.hotkeyNone")}
          value={keys.length > 0 ? <Kbd keys={keys} /> : "—"}
        />
      </StatRow>

      <div className="orbit-launcher__grid">
        <Surface
          aria-label={t("launcher.catalog.title")}
          className="orbit-launcher__apps"
          fill
          meta={catalogMeta}
          title={t("launcher.catalog.title")}
        >
          <div className="orbit-list" data-testid="orbit-launcher-apps">
            {awaitingApps ? (
              <div data-testid="orbit-launcher-apps-loading">
                <SubtleStatus className="orbit-launcher__loading" tone="attn">
                  {t("launcher.discovery.scanning")}
                </SubtleStatus>
                {Array.from({ length: 5 }, (_, index) => (
                  <div
                    aria-hidden="true"
                    className="orbit-launcher__skeleton"
                    key={`skeleton-${index}`}
                  >
                    <span className="orbit-launcher__skeleton-ico" />
                    <span className="orbit-launcher__skeleton-lines">
                      <span className="orbit-launcher__skeleton-line" />
                      <span className="orbit-launcher__skeleton-line orbit-launcher__skeleton-line--sub" />
                    </span>
                  </div>
                ))}
              </div>
            ) : visibleApps.length === 0 ? (
              <p className="orbit-launcher__empty">
                {apps.length === 0 ? t("launcher.catalog.empty") : t("launcher.searchEmpty")}
              </p>
            ) : (
              visibleApps.map((app) => (
                <ListRow
                  key={app.id}
                  leading={<AppMonogram app={app} g1={app.g1} g2={app.g2} size={39} text={app.abbreviation} />}
                  subtitle={`${t(app.categoryKey)} · ${t(app.methodKey)}`}
                  title={app.name}
                  trailing={
                    <span className="orbit-launcher__app-actions">
                      <Chip
                        className={`orbit-launcher__state orbit-launcher__state--${app.state}`}
                        tone={app.state === "installed" ? "ok" : "neutral"}
                      >
                        {t(`launcher.state.${app.state}`)}
                      </Chip>
                      <button
                        aria-label={formatMessage(
                          t(app.isFavorite ? "launcher.app.unfavorite" : "launcher.app.favorite"),
                          { name: app.name },
                        )}
                        aria-pressed={app.isFavorite}
                        className={`orbit-icon-btn orbit-icon-btn--28 orbit-launcher__star${
                          app.isFavorite ? " orbit-launcher__star--on" : ""
                        }`}
                        data-testid={`orbit-launcher-favorite-${app.id}`}
                        data-tip={formatMessage(
                          t(app.isFavorite ? "launcher.app.unfavorite" : "launcher.app.favorite"),
                          { name: app.name },
                        )}
                        data-tip-side="top"
                        onClick={() => toggleFavorite(app)}
                        type="button"
                      >
                        <StarMark filled={app.isFavorite} />
                      </button>
                      <button
                        aria-label={formatMessage(t("launcher.app.remove"), { name: app.name })}
                        className="orbit-icon-btn orbit-icon-btn--28 orbit-launcher__remove"
                        data-testid={`orbit-launcher-remove-${app.id}`}
                        data-tip={
                          app.custom
                            ? formatMessage(t("launcher.app.remove"), { name: app.name })
                            : t("launcher.app.removeBlocked")
                        }
                        data-tip-side="top"
                        disabled={!app.custom}
                        onClick={() => setAppToRemove(app)}
                        type="button"
                      >
                        <TrashMark />
                      </button>
                    </span>
                  }
                />
              ))
            )}
          </div>
          <button
            className="orbit-launcher__add-app"
            data-testid="orbit-launcher-add-app-open"
            onClick={() => setAddingApp(true)}
            type="button"
          >
            <span aria-hidden="true" className="orbit-launcher__add-app-ico">
              +
            </span>
            <span className="orbit-launcher__add-app-copy">
              <b>{t("launcher.catalog.addApp")}</b>
              <span>{t("launcher.catalog.addAppHint")}</span>
            </span>
          </button>
          {detectionRan ? null : (
            <Note className="orbit-launcher__note" title={t("launcher.catalog.neutralTitle")}>
              {t("launcher.catalog.neutral")}
            </Note>
          )}
        </Surface>

        <section
          aria-label={t("launcher.profiles.label")}
          className="orbit-launcher__profiles"
          data-testid="orbit-launcher-profiles"
        >
          {profiles.length === 0 ? (
            <p className="orbit-launcher__empty">{t("launcher.profile.empty")}</p>
          ) : (
            profiles.map((profile, index) => renderProfile(profile, index === 0))
          )}
          <button
            className="orbit-launcher__create"
            data-testid="orbit-launcher-create"
            onClick={create}
            type="button"
          >
            <span aria-hidden="true" className="orbit-launcher__create-ico">
              +
            </span>
            <span className="orbit-launcher__create-copy">
              <b>{t("launcher.profile.create")}</b>
              <span>{t("launcher.profile.createHint")}</span>
            </span>
          </button>
        </section>
      </div>

      {/* Mismo flujo real de edición y creación que el Launcher V3 (mismos
          handlers y las mismas reglas), servido por el cajón del kit. */}
      {/* La `key` remonta el cajon en cada apertura, asi el borrador nace en
          blanco sin un efecto que lo reinicie. */}
      <OrbitAddAppDrawer
        key={addingApp ? "add-app-open" : "add-app-closed"}
        onBrowse={() => dispatchLauncherCommand("launcher:app:pick")}
        onClose={() => setAddingApp(false)}
        onSubmit={({ displayName, path }) => {
          dispatchLauncherCommand("launcher:app:addCustom", { displayName, path });
          setAddingApp(false);
        }}
        open={addingApp}
        subscribeAppPicked={subscribeAppPicked}
      />

      {appToRemove ? (
        <OrbitConfirmDrawer
          body={formatMessage(t("launcher.removeApp.body"), { name: appToRemove.name })}
          cancelLabel={t("launcher.removeApp.cancel")}
          closeLabel={t("launcher.removeApp.close")}
          confirmLabel={t("launcher.removeApp.confirm")}
          data-testid="orbit-launcher-remove-app"
          hint={t("launcher.removeApp.hint")}
          onCancel={() => setAppToRemove(null)}
          onConfirm={() => {
            dispatchLauncherCommand("launcher:app:remove", { id: appToRemove.id });
            setAppToRemove(null);
          }}
          open
          title={t("launcher.removeApp.title")}
        />
      ) : null}

      {editingProfile ? (
        <OrbitProfileEditor
          apps={editorApps}
          key={editingProfile.id}
          onClose={() => {
            setEditingProfileId(null);
            setDraftProfile(null);
          }}
          onSave={(updated) => {
            setDraftProfile((draft) => (draft?.id === updated.id ? updated : draft));
            dispatchLauncherCommand("launcher:profile:save", { profile: updated });
          }}
          open
          profile={editingProfile}
        />
      ) : null}
    </div>
  );
}
