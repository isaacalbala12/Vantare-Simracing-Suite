import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import { SUPPORTED_LOCALES, translate, type Locale } from "../../i18n/i18n";
import {
  Button,
  Chip,
  Dot,
  Icon,
  KeycapRow,
  ListRow,
  Note,
  Seg,
  Select,
  StatRow,
  StatTile,
  SubtleStatus,
  Surface,
  Toggle,
} from "../../ui/orbit";
import { useAccess } from "../../lib/access";
import { useLicense } from "../../lib/license";
import { allowedUpdateChannels } from "../../lib/access-policy";
import { buildSummary, PLAN_LABELS, PLAN_STATUS_LABELS } from "../../lib/plan";
import { signOut } from "../../lib/supabase-auth";
import {
  isPremiumUnlocked,
  refreshCurrentUserEntitlements,
  resetActiveDevice,
} from "../../lib/entitlements-refresh";
import {
  applyDensity,
  getStoredDensity,
  persistDensity,
  type Density,
} from "../../lib/density";
import { getStoredThemeId, persistThemeId, type ThemeId } from "../../lib/theme";
import { isOpsMetrics, type OpsMetrics } from "../../lib/ops-metrics";
import { formatMessage } from "../orbit/format-message";
import {
  appZoomPercent,
  DEFAULT_APP_ZOOM,
  getStoredAppZoom,
  nextAppZoom,
  setAppZoom,
  subscribeAppZoom,
  type AppZoom,
} from "../orbit/app-zoom";
import { accountInitial, useAccountIdentity } from "../orbit/use-account-identity";
import { useOrbitSlot } from "../orbit/use-orbit-slot";
import { useOverlayState } from "../orbit/use-overlay-state";
import { useOrbitSimStatus } from "../orbit/sim-status-context";
import { SETTINGS_SECTIONS, type SettingsSection } from "../orbit/views";
import { RELEASE_NEWS } from "../release-news";
import { channelRelease } from "../settings/release-channel";
import type { Channel } from "../settings/settings-contract";
import type { PerformanceSettings } from "../settings/settings-contract";
import type { OverlayPerformanceV2 } from "../../generated/telemetry";
import type { ProfilePerformanceV4 } from "../../overlay/core/profile-document";
import { useAppSettings } from "../settings/useAppSettings";
import { useUpdaterSettings } from "../settings/useUpdaterSettings";
import { useStartupSettings } from "../settings/useStartupSettings";
import { useStorageSettings, formatBytes } from "../settings/useStorageSettings";
import {
  countByLevel,
  formatLogForClipboard,
  useAppLog,
  useVisibleLogEntries,
  type LogFilter,
} from "../settings/useAppLog";
import { useSystemNotifications } from "../settings/useSystemNotifications";
import {
  createDiagnosticsClient,
  type DiagnosticsEventTransport,
} from "../settings/diagnostics/diagnostics-client";
import { createBrowserDiagnosticsActions } from "../settings/diagnostics/diagnostics-actions";
import type { PreparedDiagnostics } from "../settings/diagnostics/contracts";
import { DowngradeModal } from "../settings/DowngradeModal";
import { ScheduleImportSection } from "./ScheduleImportSection";
import { CurationPrivacySection } from "./CurationPrivacySection";
import {
  applyReduceMotion,
  conflictingHotkeys,
  getStoredReduceMotion,
  HOTKEY_GROUPS,
  keycapsOf,
  maskEmail,
  persistReduceMotion,
  persistSettingsSection,
  resolveSettingsSection,
  searchSettings,
} from "./settings-orbit-model";
import "../../styles/orbit-settings.css";

export const SETTINGS_CONTEXT_SLOT_ID = "orbit-settings-context-slot";

const THEME_SWATCHES: { id: ThemeId; g1: string; g2: string }[] = [
  { id: "vantare-orbit", g1: "#0d0e11", g2: "#d52f49" },
  { id: "vantare-v5", g1: "#1a1a1f", g2: "#4a4a52" },
  { id: "vantare-lite", g1: "#2a0d13", g2: "#ff6a5f" },
];

const DENSITIES: Density[] = ["compact", "balanced", "comfortable"];

/** Módulos del plan. `soon` = el producto todavía no lo entrega. */
const PLAN_MODULES: { id: string; entitlement: "overlays" | "engineer" | null; soon?: boolean }[] = [
  { id: "overlays", entitlement: "overlays" },
  { id: "launcher", entitlement: null },
  { id: "races", entitlement: null },
  { id: "strategy", entitlement: "overlays" },
  { id: "engineer", entitlement: "engineer" },
  { id: "telemetry", entitlement: "overlays", soon: true },
];

const CHANNELS: Channel[] = ["stable", "testers", "nightly"];

export interface SettingsOrbitPageProps {
  /** Sección pedida por quien navega (rail, paleta o `?settings=`). */
  target?: string;
}

/**
 * Ajustes de Command Orbit (`15-briefings/11-ajustes.md`).
 *
 * La pantalla no guarda ningún estado propio de dominio: la sesión y el plan
 * salen de `useLicense`, el canal y las versiones de `useUpdaterSettings`, los
 * atajos de `useAppSettings` (con su bucle real de grabación), el arranque de
 * `useStartupSettings`, los datos de disco de `useStorageSettings` y las
 * métricas de proceso del evento `ops:metrics` del backend, y los últimos
 * eventos del anillo de `useAppLog` (ISA-379). Donde el prototipo dibuja algo
 * que la app todavía no tiene (lista de dispositivos, instalación automática,
 * unidades) la sección lo dice en una `Note` en vez de inventarlo.
 */
export function SettingsOrbitPage({ target }: SettingsOrbitPageProps) {
  const { t, locale, setLocale } = useI18n();
  const access = useAccess();
  const contextSlot = useOrbitSlot(SETTINGS_CONTEXT_SLOT_ID);

  const [section, setSection] = useState<SettingsSection>(() =>
    resolveSettingsSection(
      target ??
        (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("settings")),
    ),
  );

  // Cuando la shell despacha una navegación nueva («Ajustes» del rail, «Cuenta»
  // del avatar) el destino cambia y la sección tiene que seguirlo. Se ajusta
  // durante el render y no en un efecto: así no hay un frame con la sección
  // vieja pintada, que es lo que se veía al pulsar el avatar desde Ajustes.
  const [lastTarget, setLastTarget] = useState(target);
  if (target !== lastTarget) {
    setLastTarget(target);
    if (target) setSection(resolveSettingsSection(target, section));
  }

  const selectSection = useCallback((next: SettingsSection) => {
    setSection(next);
    persistSettingsSection(next);
  }, []);

  // Búsqueda de ajustes: mientras hay consulta, la columna muestra resultados
  // en vez de las secciones; elegir uno navega y limpia la búsqueda.
  const [searchQuery, setSearchQuery] = useState("");
  const searchResults = useMemo(
    () =>
      searchSettings(searchQuery, (key) => t(key)).filter(
        (entry) => entry.section !== "schedule" || access.roles.includes("owner"),
      ),
    [access.roles, searchQuery, t],
  );

  return (
    <div className="orbit-set" data-section={section} data-testid="orbit-settings">
      <header className="orbit-set__head">
        <div className="orbit-set__head-copy" data-testid="orbit-settings-head" key={section}>
          <span className="orbit-eyebrow">{t("settings.eyebrow")}</span>
          <h2 data-testid="orbit-settings-title">{t(`settings.sec.${section}.title`)}</h2>
          <p data-testid="orbit-settings-lead">{t(`settings.sec.${section}.lead`)}</p>
        </div>
      </header>

      <div
        aria-live="polite"
        className="orbit-set__panel"
        data-testid={`orbit-settings-panel-${section}`}
        key={section}
        role="tabpanel"
      >
        {section === "account" ? <AccountSection /> : null}
        {section === "application" ? (
          <ApplicationSection locale={locale} setLocale={setLocale} />
        ) : null}
        {section === "performance" ? <PerformanceSection /> : null}
        {section === "updates" ? <UpdatesSection /> : null}
        {section === "hotkeys" ? <HotkeysSection /> : null}
        {section === "privacy" ? <CurationPrivacySection /> : null}
        {section === "diagnostics" ? <DiagnosticsSection /> : null}
        {section === "schedule" ? <ScheduleImportSection /> : null}
      </div>

      {contextSlot
        ? createPortal(
            <div className="orbit-set__context">
              <section aria-label={t("settings.nav.label")} className="orbit-block">
                <div className="orbit-block__head">
                  <span className="orbit-eyebrow">{t("settings.nav.sections")}</span>
                </div>
                <input
                  aria-label={t("settings.search.placeholder")}
                  className="orbit-set-search"
                  data-testid="orbit-settings-search"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("settings.search.placeholder")}
                  type="search"
                  value={searchQuery}
                />
                {searchQuery.trim() ? (
                  searchResults.length > 0 ? (
                    <div
                      className="orbit-list"
                      data-testid="orbit-settings-search-results"
                    >
                      {searchResults.map((entry) => (
                        <ListRow
                          key={`${entry.section}:${entry.key}`}
                          onClick={() => {
                            selectSection(entry.section);
                            setSearchQuery("");
                          }}
                          subtitle={t(`settings.nav.${entry.section}`)}
                          title={t(entry.key)}
                        />
                      ))}
                    </div>
                  ) : (
                    <Note>{t("settings.search.empty")}</Note>
                  )
                ) : (
                  <div className="orbit-list" data-testid="orbit-settings-context" role="tablist">
                    {SETTINGS_SECTIONS.filter(
                      (id) => id !== "schedule" || access.roles.includes("owner"),
                    ).map((id) => (
                      <ListRow
                        ariaSelected={id === section}
                        key={id}
                        onClick={() => selectSection(id)}
                        selected={id === section}
                        subtitle={t(`settings.nav.${id}Sub`)}
                        title={t(`settings.nav.${id}`)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>,
            contextSlot,
          )
        : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ CUENTA ══ */

type AccessFeedback = "idle" | "checking" | "ok" | "none" | "error";

function AccountSection() {
  const { t } = useI18n();
  const { result: license, clearLicense } = useLicense();
  const access = useAccess();
  const [checking, setChecking] = useState<AccessFeedback>("idle");
  const [resetting, setResetting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const summary = useMemo(
    () => buildSummary(license?.state ?? null, license?.entitlements ?? []),
    [license?.state, license?.entitlements],
  );
  const entitlements = useMemo(() => new Set(license?.entitlements ?? []), [license?.entitlements]);
  const channels = allowedUpdateChannels({
    roles: license?.operationalRoles ?? [],
    capabilities: license?.capabilities ?? [],
  });

  const suite = summary.label === "suite";
  const modules = PLAN_MODULES.map((module) => ({
    ...module,
    on:
      summary.status !== "blocked" &&
      summary.status !== "anonymous" &&
      (module.entitlement === null || suite || entitlements.has(module.entitlement)),
  }));
  const included = modules.filter((module) => module.on && !module.soon).length;

  // Misma fuente de identidad que el avatar del rail: la sesión real manda y la
  // licencia sólo cubre el correo cuando la sesión aún no ha llegado.
  const identity = useAccountIdentity();
  const email = identity.email ?? license?.email ?? "";
  const name = identity.displayName ?? (email ? email.split("@")[0] : t("settings.account.noSession"));
  const avatarUrl = identity.avatarUrl;
  const none = t("settings.diag.none");

  const checkAccess = useCallback(async () => {
    setChecking("checking");
    setProblem(null);
    const refreshed = await refreshCurrentUserEntitlements();
    if (!refreshed.ok) {
      setChecking("error");
      return;
    }
    setChecking(isPremiumUnlocked(refreshed.license) ? "ok" : "none");
  }, []);

  const doSignOut = useCallback(async () => {
    const outcome = await signOut();
    if (!outcome.localCleared) {
      setProblem(outcome.localError ?? "");
      return;
    }
    clearLicense();
  }, [clearLicense]);

  const doResetDevice = useCallback(async () => {
    setResetting(true);
    const reset = await resetActiveDevice();
    setResetting(false);
    if (!reset.ok) setProblem(t("account.resetError"));
  }, [t]);

  return (
    <>
      <div className="orbit-set__hero" data-testid="orbit-settings-acct-hero">
        <section aria-label={t("settings.account.identity")} className="orbit-set-acct">
          <span aria-hidden="true" className="orbit-set-acct__avatar">
            {avatarUrl ? (
              <img alt="" data-testid="orbit-settings-acct-avatar" src={avatarUrl} />
            ) : (
              accountInitial(identity)
            )}
          </span>
          <div className="orbit-set-acct__copy">
            <b>{name}</b>
            <span>{email ? maskEmail(email) : t("settings.account.noEmail")}</span>
            <div className="orbit-set-acct__badges">
              <Chip tier="gold">{PLAN_LABELS[summary.label]}</Chip>
              <Chip>{t(`settings.upd.channel.${channels[channels.length - 1]}`)}</Chip>
              <Chip>
                {license?.deviceOK
                  ? t("settings.account.deviceBadge")
                  : t("settings.account.deviceBadgeOff")}
              </Chip>
            </div>
          </div>
          <div className="orbit-set-acct__actions">
            <Button
              data-testid="orbit-settings-check-access"
              disabled={checking === "checking"}
              onClick={checkAccess}
              size="sm"
            >
              {checking === "checking" ? t("settings.account.checking") : t("settings.account.check")}
            </Button>
            <Button data-testid="orbit-settings-sign-out" onClick={doSignOut} size="sm">
              {t("settings.account.signOut")}
            </Button>
          </div>
        </section>

        <section aria-label={t("settings.account.planEyebrow")} className="orbit-set-plan">
          <span className="orbit-eyebrow">{t("settings.account.planEyebrow")}</span>
          <b className="orbit-set-plan__name">{PLAN_LABELS[summary.label]}</b>
          <span className="orbit-set-plan__sub">
            {formatMessage(t("settings.account.planSub"), {
              modules: included,
              total: PLAN_MODULES.length,
            })}
          </span>
          <div className="orbit-set-plan__modules">
            {modules.map((module) => (
              <span
                className="orbit-set-plan__module"
                data-state={module.soon ? "soon" : module.on ? "on" : "off"}
                data-testid={`orbit-settings-module-${module.id}`}
                key={module.id}
              >
                <i aria-hidden="true" />
                {t(`settings.account.module.${module.id}`)}
                {module.soon ? ` · ${t("settings.account.planSoon")}` : ""}
              </span>
            ))}
          </div>
        </section>
      </div>

      <div className="orbit-set__grid2">
        <Surface
          aria-label={t("settings.account.session")}
          fill
          meta={t("settings.account.sessionMeta")}
          title={t("settings.account.session")}
        >
          <dl className="orbit-set-kv" data-testid="orbit-settings-session">
            <div>
              <dt>{t("settings.account.state")}</dt>
              <dd>
                <Dot variant={summary.status === "active" ? "ok" : "ring"} />
                {PLAN_STATUS_LABELS[summary.status]}
              </dd>
            </div>
            <div>
              <dt>{t("settings.account.lastAccess")}</dt>
              <dd>
                {license?.lastValidated
                  ? new Date(license.lastValidated).toLocaleString()
                  : t("settings.account.unknown")}
              </dd>
            </div>
            <div>
              <dt>{t("settings.account.graceEnds")}</dt>
              <dd>
                {license?.graceEndsAt
                  ? new Date(license.graceEndsAt).toLocaleString()
                  : t("settings.account.unknown")}
              </dd>
            </div>
            <div>
              <dt>{t("settings.account.channels")}</dt>
              <dd>{channels.map((channel) => t(`settings.upd.channel.${channel}`)).join(" · ")}</dd>
            </div>
          </dl>
        </Surface>

        <Surface
          aria-label={t("settings.account.devices")}
          fill
          meta={license?.deviceOK ? "1" : none}
          title={t("settings.account.devices")}
        >
          <div className="orbit-set-devices" data-testid="orbit-settings-devices">
            <div className="orbit-set-device" data-state={license?.deviceOK ? "on" : "off"}>
              <span aria-hidden="true" className="orbit-set-device__ico">
                PC
              </span>
              <span className="orbit-set-device__copy">
                <b>{t("settings.account.thisDevice")}</b>
                <span>
                  {license?.deviceOK
                    ? t("settings.account.deviceOk")
                    : t("settings.account.deviceKo")}
                </span>
              </span>
              <Dot variant={license?.deviceOK ? "ok" : "ring"} />
            </div>
            <Note>{t("settings.account.devicesNote")}</Note>
            <Button
              data-testid="orbit-settings-reset-device"
              disabled={resetting}
              onClick={doResetDevice}
              size="sm"
            >
              {resetting ? t("settings.account.resettingDevice") : t("settings.account.resetDevice")}
            </Button>
          </div>
        </Surface>
      </div>

      {checking !== "idle" && checking !== "checking" ? (
        <SubtleStatus tone={checking === "ok" ? "ok" : "attn"}>
          {checking === "ok"
            ? t("account.accessActivated")
            : checking === "none"
              ? t("account.noPremiumAccess")
              : t("account.refreshAccessError")}
        </SubtleStatus>
      ) : null}
      {problem ? <SubtleStatus tone="attn">{problem}</SubtleStatus> : null}
      {access.isUnconfigured ? <Note>{t("license.unconfiguredDesc1")}</Note> : null}
    </>
  );
}

/* ══════════════════════════════════════════════════════════ APLICACIÓN ══ */

function SettingRow({
  title,
  hint,
  control,
  testid,
}: {
  title: string;
  hint: ReactNode;
  control: ReactNode;
  testid?: string;
}) {
  return (
    <div className="orbit-set-row" data-testid={testid}>
      <span className="orbit-set-row__copy">
        <b>{title}</b>
        <span>{hint}</span>
      </span>
      {control}
    </div>
  );
}

function ApplicationSection({
  locale,
  setLocale,
}: {
  locale: Locale;
  setLocale(next: Locale): void;
}) {
  const { t } = useI18n();
  const app = useAppSettings();
  const startup = useStartupSettings();
  const system = useSystemNotifications();
  const notifications = app.appSettings.notifications ?? {};

  const [density, setDensity] = useState<Density>(() => getStoredDensity());
  const [theme, setTheme] = useState<ThemeId>(() => getStoredThemeId());
  const [reduce, setReduce] = useState<boolean>(() => getStoredReduceMotion());
  const [appZoom, setAppZoomState] = useState<AppZoom>(() => getStoredAppZoom());

  useEffect(() => subscribeAppZoom(setAppZoomState), []);

  const changeDensity = useCallback((next: Density) => {
    setDensity(next);
    // Se aplica antes de persistir: el usuario ve el cambio en el mismo frame.
    applyDensity(next);
    persistDensity(next);
  }, []);

  const changeReduce = useCallback((next: boolean) => {
    setReduce(next);
    applyReduceMotion(next);
    persistReduceMotion(next);
  }, []);

  const changeAppZoom = useCallback((next: AppZoom) => {
    setAppZoomState(setAppZoom(next));
  }, []);

  const notificationTestHint =
    system.test.state === "failed" ? (
      <span role="alert">
        {formatMessage(t("settings.app.notifySystemTestFailed"), {
          message: system.test.message || t("settings.app.notifySystemTestFailedUnknown"),
        })}
      </span>
    ) : system.test.state === "sent" ? (
      <span role="status">{t("settings.app.notifySystemTestSent")}</span>
    ) : system.test.state === "sending" ? (
      <span role="status">{t("settings.app.notifySystemTestSending")}</span>
    ) : (
      t("settings.app.notifySystemTestSub")
    );

  return (
    <div className="orbit-set__grid2">
      <Surface aria-label={t("settings.app.interface")} fill title={t("settings.app.interface")}>
        <div className="orbit-set-group">
          <SettingRow
            control={
              <div
                aria-label={t("settings.app.zoom")}
                className="orbit-set-zoom"
                data-testid="orbit-settings-zoom"
                role="group"
              >
                <button
                  aria-label={t("settings.app.zoomDecrease")}
                  data-testid="orbit-settings-zoom-minus"
                  disabled={appZoom === 0.8}
                  onClick={() => changeAppZoom(nextAppZoom(appZoom, -1))}
                  type="button"
                >
                  −
                </button>
                <button
                  aria-label={formatMessage(t("settings.app.zoomReset"), {
                    value: appZoomPercent(appZoom),
                  })}
                  aria-live="polite"
                  className="orbit-set-zoom__value"
                  data-testid="orbit-settings-zoom-value"
                  onClick={() => changeAppZoom(DEFAULT_APP_ZOOM)}
                  type="button"
                >
                  {appZoomPercent(appZoom)}%
                </button>
                <button
                  aria-label={t("settings.app.zoomIncrease")}
                  data-testid="orbit-settings-zoom-plus"
                  disabled={appZoom === 1.5}
                  onClick={() => changeAppZoom(nextAppZoom(appZoom, 1))}
                  type="button"
                >
                  +
                </button>
              </div>
            }
            hint={t("settings.app.zoomSub")}
            testid="orbit-settings-app-zoom"
            title={t("settings.app.zoom")}
          />
          <SettingRow
            control={
              <Select
                label={t("settings.app.language")}
                onChange={(next) => setLocale(next as Locale)}
                options={SUPPORTED_LOCALES.map((value) => ({
                  value,
                  label: translate(value, `language.${value}`),
                }))}
                value={locale}
                width={168}
              />
            }
            hint={t("settings.app.languageSub")}
            testid="orbit-settings-language"
            title={t("settings.app.language")}
          />
          <SettingRow
            control={
              <Select
                label={t("settings.app.density")}
                onChange={(next) => changeDensity(next as Density)}
                options={DENSITIES.map((value) => ({
                  value,
                  label: t(`settings.app.density.${value}`),
                }))}
                value={density}
                width={168}
              />
            }
            hint={t("settings.app.densitySub")}
            testid="orbit-settings-density"
            title={t("settings.app.density")}
          />
          <SettingRow
            control={
              <div className="orbit-set-themes" data-testid="orbit-settings-themes">
                {THEME_SWATCHES.map((swatch) => (
                  <button
                    aria-label={t(`settings.app.theme.${swatch.id}`)}
                    aria-pressed={theme === swatch.id}
                    className="orbit-set-theme"
                    data-testid={`orbit-settings-theme-${swatch.id}`}
                    key={swatch.id}
                    onClick={() => {
                      setTheme(swatch.id);
                      persistThemeId(swatch.id);
                    }}
                    type="button"
                  >
                    <i
                      aria-hidden="true"
                      style={{ background: `linear-gradient(135deg, ${swatch.g1}, ${swatch.g2})` }}
                    />
                  </button>
                ))}
              </div>
            }
            hint={t("settings.app.themeSub")}
            title={t("settings.app.theme")}
          />
          <SettingRow
            control={
              <Toggle
                label={t("settings.app.reduceMotion")}
                onChange={changeReduce}
                pressed={reduce}
              />
            }
            hint={t("settings.app.reduceMotionSub")}
            testid="orbit-settings-reduce-motion"
            title={t("settings.app.reduceMotion")}
          />
        </div>
        <Note>{t("settings.app.themeNote")}</Note>
      </Surface>

      <Surface aria-label={t("settings.app.system")} fill title={t("settings.app.system")}>
        <div className="orbit-set-group">
          <SettingRow
            control={
              <Toggle
                disabled={!startup.startup.supported}
                label={t("settings.app.startup")}
                onChange={(next) => startup.setEnabled(next)}
                pressed={startup.startup.enabled}
              />
            }
            hint={
              startup.startup.supported
                ? t("settings.app.startupSub")
                : t("settings.app.startupUnsupported")
            }
            testid="orbit-settings-startup"
            title={t("settings.app.startup")}
          />
          <SettingRow
            control={
              <Toggle
                disabled={!startup.startup.supported || !startup.startup.enabled}
                label={t("settings.app.startupMinimised")}
                onChange={(next) => startup.setMinimised(next)}
                pressed={startup.startup.minimised}
              />
            }
            hint={t("settings.app.startupMinimisedSub")}
            title={t("settings.app.startupMinimised")}
          />
          <SettingRow
            control={
              <Toggle
                label={t("settings.app.notifyUpdates")}
                onChange={(next) => app.setNotifications({ updatesMuted: !next })}
                pressed={!notifications.updatesMuted}
              />
            }
            hint={t("settings.app.notifyUpdatesSub")}
            title={t("settings.app.notifyUpdates")}
          />
          <SettingRow
            control={
              <Toggle
                label={t("settings.app.notifyLauncher")}
                onChange={(next) => app.setNotifications({ launcherMuted: !next })}
                pressed={!notifications.launcherMuted}
              />
            }
            hint={t("settings.app.notifyLauncherSub")}
            title={t("settings.app.notifyLauncher")}
          />
          <SettingRow
            control={
              <Toggle
                disabled={!system.status.supported}
                label={t("settings.app.notifySystem")}
                onChange={(next) => {
                  if (next) system.authorize();
                  app.setNotifications({ systemEnabled: next });
                }}
                pressed={Boolean(notifications.systemEnabled) && system.status.authorized}
              />
            }
            hint={
              system.status.supported
                ? t("settings.app.notifySystemSub")
                : t("settings.app.notifySystemUnsupported")
            }
            title={t("settings.app.notifySystem")}
          />
          <SettingRow
            control={
              <Button
                data-testid="orbit-settings-notification-test"
                disabled={!system.status.supported || system.test.state === "sending"}
                loading={system.test.state === "sending"}
                onClick={system.sendTest}
                size="sm"
              >
                {system.test.state === "sending"
                  ? t("settings.app.notifySystemTestSendingButton")
                  : t("settings.app.notifySystemTestButton")}
              </Button>
            }
            hint={notificationTestHint}
            title={t("settings.app.notifySystemTest")}
          />
        </div>
        <Note>{t("settings.app.missingNote")}</Note>
      </Surface>
    </div>
  );
}

type PerformanceChoice = "1" | "2" | "3" | "4" | "5" | "custom" | "auto";

const PERFORMANCE_CHOICES: PerformanceChoice[] = ["1", "2", "3", "4", "5", "custom", "auto"];

/** Las etiquetas del catálogo viven en `studio.v3.widgetTypes.<camelCase>`
 *  (`pedals-telemetry` → `pedalsTelemetry`). */
function widgetTypeLabelKey(type: string): string {
  const [head, ...rest] = type.split("-");
  return `studio.v3.widgetTypes.${head}${rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("")}`;
}

function PerformanceSection() {
  const { t } = useI18n();
  const app = useAppSettings();
  const overlay = useOverlayState();
  const activeProfileFile = overlay.active?.file;
  const [effective, setEffective] = useState<OverlayPerformanceV2 | null>(null);
  const [profilePerformanceEdit, setProfilePerformanceEdit] = useState<{
    file: string;
    performance?: ProfilePerformanceV4;
  } | null>(null);
  const profileSaveSequence = useRef(0);
  const pendingProfileSave = useRef<string | null>(null);
  const profilePerformance =
    profilePerformanceEdit && profilePerformanceEdit.file === activeProfileFile
      ? profilePerformanceEdit.performance
      : overlay.active?.performance;

  useEffect(() => {
    const offLevel = Events.On("performance:level", (event: { data?: OverlayPerformanceV2 }) => {
      if (event.data) setEffective(event.data);
    });
    const offSaved = Events.On("studio:profile:performance:saved", (event: { data?: { requestId?: string; performance?: ProfilePerformanceV4 } }) => {
      if (!event.data?.requestId || event.data.requestId !== pendingProfileSave.current) return;
      pendingProfileSave.current = null;
      if (activeProfileFile) {
        setProfilePerformanceEdit({
          file: activeProfileFile,
          performance: event.data?.performance,
        });
      }
      Events.Emit("hub:list");
    });
    const offRefresh = Events.On("hub:profiles:refresh", () => Events.Emit("hub:list"));
    Events.Emit("settings:get");
    return () => {
      offLevel?.();
      offSaved?.();
      offRefresh?.();
    };
  }, [activeProfileFile]);

  const appPerformance = app.appSettings.performance ?? { mode: "level", level: 1 };
  const selected: PerformanceChoice =
    profilePerformance?.mode === "custom"
      ? "custom"
      : appPerformance.mode === "auto"
        ? "auto"
        : String(appPerformance.level) as PerformanceChoice;
  const level = effective?.level ?? profilePerformance?.level ?? appPerformance.level;

  const saveProfilePerformance = useCallback((performance: ProfilePerformanceV4) => {
    profileSaveSequence.current += 1;
    const requestId = `performance-${profileSaveSequence.current.toString(36)}`;
    pendingProfileSave.current = requestId;
    Events.Emit("studio:profile:performance:save", {
      requestId,
      performance,
    });
  }, []);

  const choose = (choice: PerformanceChoice) => {
    if (choice === "auto") return;
    if (choice === "custom") {
      if (!overlay.active) return;
      saveProfilePerformance({
        mode: "custom",
        level: level as 1 | 2 | 3 | 4 | 5,
        overrides: profilePerformance?.overrides ?? {},
      });
      return;
    }
    app.setPerformance({ mode: "level", level: Number(choice) as PerformanceSettings["level"] });
  };

  const updateOverride = (widgetId: string, hz?: number | "dirty") => {
    const current = profilePerformance?.overrides?.[widgetId] ?? {};
    const next = { ...current, hz };
    if (hz === undefined) delete next.hz;
    const overrides = { ...(profilePerformance?.overrides ?? {}) };
    if (next.hz === undefined && next.effects === undefined) delete overrides[widgetId];
    else overrides[widgetId] = next;
    saveProfilePerformance({
      mode: "custom",
      level: level as 1 | 2 | 3 | 4 | 5,
      overrides,
    });
  };

  const widgets = overlay.active?.previewDocument?.layouts.general.widgets ?? [];

  return (
    <div className="orbit-set-perf" data-testid="orbit-settings-performance">
      <Surface
        aria-label={t("settings.performance.title")}
        fill
        meta={
          effective ? (
            <SubtleStatus tone="ok">
              {t("settings.performance.effective")} · {t(`settings.performance.${effective.level}`)} ·{" "}
              {effective.rafCap ? `${effective.rafCap} fps` : t("settings.performance.rate1")}
              {effective.reason ? ` · ${t(`settings.performance.reason.${effective.reason}`)}` : ""}
            </SubtleStatus>
          ) : null
        }
        title={t("settings.performance.title")}
      >
        <div
          aria-label={t("settings.performance.title")}
          className="orbit-set-perf__ladder"
          data-testid="orbit-settings-performance-options"
          role="radiogroup"
        >
          {PERFORMANCE_CHOICES.map((choice) => {
            const isLevel = choice !== "custom" && choice !== "auto";
            const disabled = choice === "auto" || (choice === "custom" && !overlay.active);
            const on = selected === choice;
            const rate = isLevel
              ? t(`settings.performance.rate${choice}`)
              : choice === "auto"
                ? t("settings.performance.soon")
                : overlay.active
                  ? formatMessage(t("settings.performance.customActive"), { name: overlay.active.name ?? "" })
                  : t("settings.performance.customNoProfile");
            return (
              <button
                aria-checked={on}
                aria-disabled={disabled || undefined}
                className={`orbit-set-perf__card orbit-set-perf__card--${isLevel ? "level" : "mode"}`}
                data-level={isLevel ? choice : undefined}
                data-state={on ? "on" : undefined}
                data-testid={`orbit-settings-performance-${choice}`}
                disabled={choice === "auto"}
                key={choice}
                onClick={() => choose(choice)}
                role="radio"
                type="button"
              >
                <span className="orbit-set-perf__top">
                  <b>{t(`settings.performance.${choice}`)}</b>
                  {on ? <Dot variant="ok" /> : <Dot variant="ring" />}
                </span>
                {isLevel ? (
                  <span aria-hidden="true" className="orbit-set-perf__meter">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <i data-on={step <= 6 - Number(choice) ? "true" : undefined} key={step} />
                    ))}
                  </span>
                ) : null}
                <span className="orbit-set-perf__rate">{rate}</span>
                <span className="orbit-set-perf__copy">{t(`settings.performance.${choice}Sub`)}</span>
              </button>
            );
          })}
        </div>
        <p className="orbit-set-perf__hint">{t("settings.performance.profileNote")}</p>
        {appPerformance.migratedFrom === "rollout-level-1" ? (
          <div data-testid="orbit-settings-performance-rollout-notice">
            <Note>{t("settings.performance.rolloutMigrationNotice")}</Note>
          </div>
        ) : null}
        {overlay.active?.migrationNotices?.length ? (
          <div className="orbit-set-perf__notices" data-testid="orbit-settings-performance-migration-notices">
            {overlay.active.migrationNotices.map((notice) => (
              <Note key={`${notice.path}:${notice.updateHz}`}>
                {formatMessage(t("settings.performance.migrationNotice"), {
                  widget: notice.widgetId,
                  hz: notice.updateHz,
                })}
              </Note>
            ))}
          </div>
        ) : null}
      </Surface>

      {selected === "custom" ? (
        <Surface
          aria-label={t("settings.performance.table")}
          fill
          meta={overlay.active ? <SubtleStatus>{overlay.active.name}</SubtleStatus> : null}
          title={t("settings.performance.table")}
        >
          {overlay.active ? (
            <table className="orbit-set-perf__table" data-testid="orbit-settings-performance-table">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>{t("settings.performance.widget")}</th>
                  <th>{t("settings.performance.currentHz")}</th>
                  <th>{t("settings.performance.overrideHz")}</th>
                  <th>{t("settings.performance.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {widgets.map((widget) => {
                  const baseline = effective?.widgetHz[widget.type];
                  const override = profilePerformance?.overrides?.[widget.id];
                  const cpuCost =
                    typeof override?.hz === "number" && typeof baseline === "number" && override.hz > baseline;
                  return (
                    <tr data-testid={`orbit-settings-performance-row-${widget.id}`} key={widget.id}>
                      <th scope="row">{t(widgetTypeLabelKey(widget.type))}</th>
                      <td className="orbit-set-perf__hz">
                        {baseline === "dirty" || baseline === "event"
                          ? t(`settings.performance.${baseline}`)
                          : typeof baseline === "number"
                            ? `${baseline} Hz`
                            : "—"}
                      </td>
                      <td>
                        <Select
                          label={t("settings.performance.overrideHz")}
                          onChange={(value) => updateOverride(
                            widget.id,
                            value === "" ? undefined : value === "dirty" ? "dirty" : Number(value),
                          )}
                          options={[
                            { value: "", label: t("settings.performance.inherit") },
                            { value: "dirty", label: t("settings.performance.dirty") },
                            ...[1, 2, 4, 5, 10, 15, 20, 30, 40, 60].map((hz) => ({ value: String(hz), label: `${hz} Hz` })),
                          ]}
                          value={override?.hz === undefined ? "" : String(override.hz)}
                          width={128}
                        />
                      </td>
                      <td className="orbit-set-perf__cost">
                        {cpuCost ? <Chip tone="warn">+CPU</Chip> : <span className="orbit-set-perf__none">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Note>{t("settings.performance.noProfile")}</Note>
          )}
        </Surface>
      ) : null}
    </div>
  );
}

/* ═════════════════════════════════════════════════════ ACTUALIZACIONES ══ */

function UpdatesSection() {
  const { t } = useI18n();
  const access = useAccess();
  // El hook necesita saber que canales permite la licencia: elegir uno cerrado
  // no puede acabar en `updater:settings:save`.
  const allowed = useMemo(() => allowedUpdateChannels(access), [access]);
  const updater = useUpdaterSettings({ allowed });

  const info = updater.info;
  const latest = info?.latestRelease ?? null;
  const state = updater.loading
    ? t("settings.upd.stateChecking")
    : !info
      ? t("settings.upd.stateUnknown")
      : info.hasUpdate && info.latestVersion
        ? formatMessage(t("settings.upd.stateAvailable"), { version: info.latestVersion })
        : t("settings.upd.stateUpToDate");

  // La versión y la fecha de cada canal salen del resumen por canal del
  // backend, que clasifica por el tag real: `prerelease` solo, no distingue una
  // nightly de una de testers y ambas tarjetas acababan enseñando la misma.
  // Un canal sin publicación lo dice, no se le inventa una versión.
  const releaseFor = (channel: Channel) => channelRelease(channel, info);

  return (
    <>
      <section className="orbit-set-upd" data-testid="orbit-settings-upd-hero">
        <div className="orbit-set-upd__ver">
          <span className="orbit-eyebrow">{t("settings.upd.installed")}</span>
          <b data-testid="orbit-settings-version">{info?.currentVersion ?? "—"}</b>
          <span className="orbit-set-upd__meta">
            {formatMessage(t("settings.upd.meta"), {
              channel: t(`settings.upd.channel.${updater.settings.channel}`),
              state,
            })}
          </span>
        </div>
        <div className="orbit-set-upd__actions">
          {latest && info?.hasUpdate ? (
            <Button
              data-testid="orbit-settings-install"
              // Una instalacion a la vez: el backend rechaza la segunda, y ese
              // rechazo se leia como «ha fallado» encima de la que si iba bien.
              disabled={updater.installingTag !== null}
              onClick={() => updater.install(latest)}
              variant="primary"
            >
              {formatMessage(t("settings.upd.install"), { version: latest.tag_name })}
            </Button>
          ) : null}
          <Button
            data-testid="orbit-settings-check-updates"
            disabled={updater.loading}
            onClick={updater.refresh}
            variant="primary"
          >
            {t("settings.upd.check")}
          </Button>
        </div>
      </section>

      <div
        aria-label={t("settings.upd.channels")}
        className="orbit-set-channels"
        data-testid="orbit-settings-channels"
        role="radiogroup"
      >
        {CHANNELS.map((channel) => {
          const locked = !allowed.includes(channel);
          const release = releaseFor(channel);
          const active = updater.settings.channel === channel;
          return (
            <button
              aria-checked={active}
              className="orbit-set-channel"
              data-locked={locked ? "true" : undefined}
              data-state={active ? "on" : undefined}
              data-testid={`orbit-settings-channel-${channel}`}
              key={channel}
              // Un canal cerrado no se desactiva: un boton `disabled` no recibe
              // el clic ni el foco, asi que el candado no se podia ni leer y la
              // tarjeta parecia rota. Sigue sin cambiar el canal, pero ahora
              // responde y explica por que.
              aria-disabled={locked || undefined}
              onClick={() => updater.changeChannel(channel)}
              role="radio"
              type="button"
            >
              <span className="orbit-set-channel__top">
                <b>{t(`settings.upd.channel.${channel}`)}</b>
                {locked ? (
                  <span className="orbit-set-channel__lock" data-testid={`orbit-settings-lock-${channel}`}>
                    <Icon name="i-lock" size={13} />
                  </span>
                ) : (
                  <Dot variant={active ? "ok" : "ring"} />
                )}
              </span>
              <span className="orbit-set-channel__copy">
                {t(`settings.upd.channel.${channel}Copy`)}
                {locked ? ` ${t("settings.upd.channelLocked")}.` : ""}
              </span>
              <span className="orbit-set-channel__meta">
                {release
                  ? `${release.tag_name} · ${new Date(release.published_at).toLocaleDateString()}`
                  : t("settings.upd.channelNoRelease")}
              </span>
            </button>
          );
        })}
      </div>

      {updater.channelDenied ? (
        <span data-testid="orbit-settings-channel-denied" role="status">
          <SubtleStatus tone="attn">
            {formatMessage(t("settings.upd.channelDeniedReason"), {
              channel: t(`settings.upd.channel.${updater.channelDenied}`),
            })}
          </SubtleStatus>
        </span>
      ) : null}

      <Surface
        aria-label={t("settings.upd.news")}
        className="orbit-set__news"
        fill
        meta={t("settings.upd.newsMeta")}
        title={t("settings.upd.news")}
      >
        {RELEASE_NEWS.length > 0 ? (
          <ul className="orbit-set-changelog" data-testid="orbit-settings-changelog">
            {RELEASE_NEWS.map((release) => (
              <li key={release.tag}>
                <span className="orbit-set-changelog__ver">{release.tag}</span>
                <span className="orbit-set-changelog__copy">
                  <b>{release.title}</b> — {release.summary}
                </span>
                <span className="orbit-set-changelog__tag">{release.channel}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Note>{t("settings.upd.newsEmpty")}</Note>
        )}
      </Surface>

      <Note>{t("settings.upd.autoNote")}</Note>
      {updater.error ? <SubtleStatus tone="attn">{updater.error}</SubtleStatus> : null}

      {updater.confirmDowngrade ? (
        <DowngradeModal
          currentVersion={info?.currentVersion}
          onCancel={() => updater.setConfirmDowngrade(null)}
          onConfirm={() => updater.startInstall(updater.confirmDowngrade!)}
          release={updater.confirmDowngrade}
        />
      ) : null}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════ ATAJOS ══ */

function HotkeysSection() {
  const { t } = useI18n();
  const app = useAppSettings();
  const conflicts = useMemo(
    () => conflictingHotkeys(app.appSettings.hotkeys ?? {}),
    [app.appSettings.hotkeys],
  );

  return (
    <>
      <header className="orbit-set-hk__head">
        <div>
          <span className="orbit-eyebrow">{t("settings.hk.eyebrow")}</span>
          <p>{t("settings.hk.lead")}</p>
        </div>
        <div className="orbit-set-hk__actions">
          <Button data-testid="orbit-settings-hk-reset" onClick={app.resetHotkeys} size="sm">
            {t("settings.hk.reset")}
          </Button>
          <span data-testid="orbit-settings-hk-status">
            <SubtleStatus tone={conflicts.size > 0 ? "attn" : "ok"}>
              {conflicts.size > 0
                ? formatMessage(t("settings.hk.conflicts"), { n: conflicts.size })
                : t("settings.hk.noConflicts")}
            </SubtleStatus>
          </span>
        </div>
      </header>

      <div className="orbit-set-hk__groups">
        {HOTKEY_GROUPS.map((group) => (
          <Surface
            aria-label={t(`settings.hk.group.${group.id}`)}
            key={group.id}
            meta={formatMessage(t("settings.hk.groupMeta"), { n: group.keys.length })}
            title={t(`settings.hk.group.${group.id}`)}
          >
            <div className="orbit-set-hk__list" data-testid="orbit-settings-hotkeys">
              {group.keys.map((key) => {
                const keys = keycapsOf(app.appSettings.hotkeys?.[key]);
                return (
                  <KeycapRow
                    className={`orbit-set-hk-row-${key}`}
                    conflict={conflicts.has(key)}
                    conflictLabel={t("settings.hk.conflict")}
                    description={t(`settings.hk.desc.${key}`)}
                    empty={keys.length === 0}
                    emptyLabel={t("settings.hk.unassigned")}
                    key={key}
                    keys={keys}
                    onRecord={() => app.startCapture(key)}
                    recording={app.capturingKey === key}
                    recordingLabel={t("settings.hk.recording")}
                    title={t(`settings.hotkeys.${key}`)}
                  />
                );
              })}
            </div>
          </Surface>
        ))}
      </div>

      <Note>{t("settings.hk.contractNote")}</Note>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════ DIAGNÓSTICO ══ */

/**
 * ISA-379: «Últimos eventos» deja de estar honestamente vacío.
 *
 * El backend publica su anillo de registros (`internal/applog`) y empuja cada
 * entrada nueva. Sin ese canal —maqueta o build sin backend— la tarjeta sigue
 * diciendo la verdad en vez de inventar filas.
 */
function EventLogSurface() {
  const { t, locale } = useI18n();
  const log = useAppLog();
  const [filter, setFilter] = useState<LogFilter>("all");
  const [copied, setCopied] = useState(false);
  const visible = useVisibleLogEntries(log.entries, filter);
  const counts = useMemo(() => countByLevel(log.entries), [log.entries]);

  // El aviso de copiado se retira solo; sin esto quedaría fijo para siempre.
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = useCallback(() => {
    void navigator.clipboard
      ?.writeText(formatLogForClipboard(visible))
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }, [visible]);

  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { timeStyle: "medium" }),
    [locale],
  );

  const filters: LogFilter[] = ["all", "info", "warn", "error"];

  return (
    <Surface
      actions={
        log.available && log.entries.length > 0 ? (
          <Button
            data-testid="orbit-settings-log-copy"
            onClick={copy}
            size="sm"
            variant="ghost"
          >
            {t(copied ? "settings.diag.eventsCopied" : "settings.diag.eventsCopy")}
          </Button>
        ) : null
      }
      aria-label={t("settings.diag.events")}
      fill
      meta={
        log.available
          ? formatMessage(t("settings.diag.eventsCount"), { n: log.entries.length })
          : t("settings.diag.eventsMeta")
      }
      title={t("settings.diag.events")}
    >
      {log.available && log.entries.length > 0 ? (
        // El argumento de tipo explícito es necesario, no decorativo: al
        // inferirlo, `onChange` compite como origen y `T` sale como
        // `SetStateAction<LogFilter>`, que no extiende `string`. Mismo patrón
        // que el filtro de radio de Ingeniero.
        <Seg<LogFilter>
          className="orbit-set-log__filter"
          label={t("settings.diag.eventsFilter")}
          onChange={setFilter}
          options={filters.map((level) => ({
            value: level,
            label: `${t(`settings.diag.eventsLevel.${level}`)} ${counts[level]}`,
          }))}
          value={filter}
        />
      ) : null}
      <div className="orbit-set-log" data-testid="orbit-settings-log">
        {!log.available ? (
          <Note>{t("settings.diag.eventsEmpty")}</Note>
        ) : log.entries.length === 0 ? (
          <Note>{t("settings.diag.eventsQuiet")}</Note>
        ) : visible.length === 0 ? (
          <Note>{t("settings.diag.eventsFiltered")}</Note>
        ) : (
          <ul className="orbit-set-log__list">
            {visible.map((entry) => (
              <li className="orbit-set-log__row" data-level={entry.level} key={entry.seq}>
                <span className="orbit-set-log__time">
                  {timeFormat.format(new Date(entry.time))}
                </span>
                <span className="orbit-set-log__level">
                  {t(`settings.diag.eventsLevel.${entry.level}`)}
                </span>
                <span className="orbit-set-log__msg">{entry.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Surface>
  );
}

type ReportState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "ready"; prepared: PreparedDiagnostics }
  | { kind: "error" };

function DiagnosticsSection() {
  const { t, locale } = useI18n();
  const app = useAppSettings();
  const overlay = useOverlayState();
  const storage = useStorageSettings();
  const simStatus = useOrbitSimStatus() ?? "disconnected";
  const [metrics, setMetrics] = useState<OpsMetrics | null>(null);
  const [report, setReport] = useState<ReportState>({ kind: "idle" });
  const aborted = useRef<AbortController | null>(null);
  // Mismo transporte que `WailsDiagnosticsPanel`: la pantalla no habla con Go
  // por su cuenta, usa el cliente de diagnóstico que ya existe.
  const client = useMemo(
    () =>
      createDiagnosticsClient({
        emit: (name, payload) => Events.Emit(name, payload),
        on: (name, listener) => Events.On(name, listener),
      } satisfies DiagnosticsEventTransport),
    [],
  );
  const diagnosticsActions = useMemo(() => createBrowserDiagnosticsActions(), []);

  // `ops:metrics` lo emite el backend cada pocos segundos (`internal/app/ops_bridge.go`).
  useEffect(() => {
    const unsub = Events.On("ops:metrics", (event: { data?: unknown }) => {
      if (isOpsMetrics(event.data)) setMetrics(event.data);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => () => aborted.current?.abort(), []);

  const prepare = useCallback(async () => {
    setReport({ kind: "working" });
    const controller = new AbortController();
    aborted.current = controller;
    try {
      const prepared = await client.prepare(controller.signal);
      setReport({ kind: "ready", prepared });
    } catch {
      setReport({ kind: "error" });
    }
  }, [client]);

  const none = t("settings.diag.none");
  const dataFolder = storage.summary.locations[0] ?? null;
  // Se busca por clave, no por índice: el orden lo decide el backend y la
  // ubicación falta por completo cuando no hay dónde escribir el registro.
  const logsFolder = storage.summary.locations.find((location) => location.key === "logs") ?? null;

  return (
    <>
      <StatRow className="orbit-set__stats">
        <StatTile
          label={t("settings.diag.core")}
          sub={t(
            simStatus === "connected"
              ? "settings.diag.coreConnected"
              : simStatus === "searching"
                ? "settings.diag.coreSearching"
                : "settings.diag.coreOffline",
          )}
          tone={simStatus === "connected" ? "ok" : "neutral"}
          // El nombre real de la fuente lo trae `ops:metrics`; hasta que llega
          // la primera muestra se dice el estado que ya publica la shell, no un
          // guion que contradiga al subtítulo de al lado.
          value={metrics?.source.name || t(`shell.sim.${simStatus}`)}
        />
        <StatTile
          label={t("settings.diag.overlay")}
          sub={
            overlay.active
              ? formatMessage(t("settings.diag.overlayProfile"), {
                  name: overlay.active.name ?? overlay.active.id,
                })
              : t("settings.diag.overlayNoProfile")
          }
          tone={overlay.running ? "hot" : "neutral"}
          value={
            overlay.running ? t("settings.diag.overlayRunning") : t("settings.diag.overlayStopped")
          }
        />
        <StatTile
          label={t("settings.diag.cpu")}
          sub={
            metrics
              ? formatMessage(t("settings.diag.cpuSub"), { goroutines: metrics.app.goroutines })
              : t("settings.diag.cpuWaiting")
          }
          unit={metrics ? `% · ${Math.round(metrics.app.memoryMb)} MB` : undefined}
          value={metrics ? (metrics.app.cpuPercent ?? 0).toFixed(1) : none}
        />
        <StatTile
          label={t("settings.diag.storage")}
          sub={
            storage.loaded
              ? formatMessage(t("settings.diag.storageSub"), {
                  n: storage.summary.locations.length,
                })
              : t("settings.diag.storageWaiting")
          }
          value={storage.loaded ? formatBytes(storage.summary.totalBytes) : none}
        />
      </StatRow>

      <div className="orbit-set__grid2">
        <Surface aria-label={t("settings.diag.data")} fill title={t("settings.diag.data")}>
          <div className="orbit-set-group">
            <SettingRow
              control={
                dataFolder ? (
                  <Button onClick={() => storage.reveal(dataFolder.key)} size="sm">
                    {t("settings.diag.folderOpen")}
                  </Button>
                ) : (
                  <span className="orbit-set-row__none">{none}</span>
                )
              }
              hint={dataFolder?.path ?? t("settings.diag.folderEmpty")}
              testid="orbit-settings-data-folder"
              title={t("settings.diag.folder")}
            />
            {/* ISA-379: el backend ya publica `logs` como ubicación, así que
                el botón deja de ser mudo. Si no la publica —build sin sitio
                donde escribir— se dice por qué en vez de pintar un botón que
                no abriría nada. */}
            <SettingRow
              control={
                logsFolder ? (
                  <Button onClick={() => storage.reveal(logsFolder.key)} size="sm">
                    {t("settings.diag.logsOpen")}
                  </Button>
                ) : (
                  <span className="orbit-set-row__none">{none}</span>
                )
              }
              hint={logsFolder?.path ?? t("settings.diag.logsUnavailable")}
              testid="orbit-settings-logs-folder"
              title={t("settings.diag.logs")}
            />
            <SettingRow
              control={
                <Toggle
                  label={t("settings.diag.sampling")}
                  onChange={app.toggleCpuSampling}
                  pressed={app.appSettings.cpuSampling}
                />
              }
              hint={t("settings.diag.samplingSub")}
              testid="orbit-settings-cpu-sampling"
              title={t("settings.diag.sampling")}
            />
            <SettingRow
              control={
                <Button
                  data-testid="orbit-settings-prepare-report"
                  disabled={report.kind === "working"}
                  onClick={prepare}
                  size="sm"
                  variant="primary"
                >
                  {report.kind === "working"
                    ? t("settings.diag.preparing")
                    : t("settings.diag.prepare")}
                </Button>
              }
              hint={t("settings.diag.reportSub")}
              title={t("settings.diag.report")}
            />
          </div>
          {report.kind === "ready" ? (
            <>
              <SubtleStatus tone="ok">
                {formatMessage(t("settings.diag.reportReady"), {
                  bytes: formatBytes(report.prepared.byteSize),
                  date: new Intl.DateTimeFormat(locale, { timeStyle: "medium" }).format(
                    new Date(report.prepared.generatedAtUtc),
                  ),
                })}
              </SubtleStatus>
              {/* El informe solo sirve si puede salir de la app: la acción de
                  descarga ya existía y estaba probada, esta fila es quien la
                  ofrecía y había quedado sin dueño en el porte a Orbit. */}
              <div>
                <Button
                  data-testid="orbit-settings-report-download"
                  onClick={() => diagnosticsActions.download(report.prepared)}
                  size="sm"
                >
                  {t("settings.diag.reportDownload")}
                </Button>
              </div>
            </>
          ) : null}
          {report.kind === "error" ? (
            <SubtleStatus tone="attn">{t("settings.diag.reportError")}</SubtleStatus>
          ) : null}
          {storage.error ? <SubtleStatus tone="attn">{storage.error}</SubtleStatus> : null}
        </Surface>

        <EventLogSurface />
      </div>
    </>
  );
}
