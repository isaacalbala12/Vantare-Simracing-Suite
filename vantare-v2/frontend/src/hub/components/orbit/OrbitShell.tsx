import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Events } from "@wailsio/runtime";
import { useAccess } from "../../../lib/access";
import { useLicense } from "../../../lib/license";
import { useI18n } from "../../../i18n/I18nProvider";
import type { TelemetrySourceStatus } from "../../../telemetry-transport/source-status";
import type { TestingCenterChannel } from "../../testing-center/contracts";
import { useLauncherSnapshot } from "../../launcher/launcher-store";
import { profileTarget } from "../../state/overlay-workbench";
import { type Section } from "../../navigation";
import { formatMessage } from "../../orbit/format-message";
import { ORBIT_KEYS, orbitStore } from "../../orbit/orbit-store";
import { applyOrbitThemeWhileMounted } from "../../orbit/orbit-theme";
import { useCalendarStarts } from "../../orbit/use-calendar-starts";
import { OrbitSimStatusContext } from "../../orbit/sim-status-context";
import { useOverlayState } from "../../orbit/use-overlay-state";
import {
  canSeeView,
  planLabelOf,
  RAIL_ORDER,
  REQUIRED_PLAN,
  sectionToView,
  viewToSection,
  type SimStatus,
  type UpdateState,
  type ViewId,
} from "../../orbit/views";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { ContextColumn, type ContextColumnBlock } from "./ContextColumn";
import { Rail, type RailItem } from "./Rail";
import { SideLauncher } from "./SideLauncher";
import { SideProfile } from "./SideProfile";
import { SideRaces } from "./SideRaces";
import { Topbar } from "./Topbar";
import { HomeOrbitPage } from "../../home-orbit/HomeOrbitPage";
import {
  LauncherOrbitPage,
  LAUNCHER_CONTEXT_SLOT_ID,
  LAUNCHER_TOPBAR_SLOT_ID,
} from "../../launcher-orbit/LauncherOrbitPage";
import { ToastProvider } from "../../../ui/orbit/Toast";
import { useToast } from "../../../ui/orbit/toast-context";
import "../../../styles/orbit.tokens.css";
import "../../../styles/orbit-kit.css";
import "../../../styles/orbit-shell.css";

const AUTO_COLLAPSE_WIDTH = 1152;

const RAIL_LABEL_KEY: Record<ViewId, string> = {
  inicio: "shell.rail.home",
  studio: "shell.rail.studio",
  launcher: "shell.rail.launcher",
  carreras: "shell.rail.races",
  estrategia: "shell.rail.strategy",
  ingeniero: "shell.rail.engineer",
  telemetria: "shell.rail.telemetry",
  roadmap: "shell.rail.roadmap",
  ajustes: "shell.rail.settings",
  testing: "shell.rail.testing",
};

export type OrbitShellProps = {
  activeSection: Section;
  onNavigate: (section: string, target?: string) => void;
  version?: string | null;
  sourceStatus?: TelemetrySourceStatus | null;
  testingCenterChannel?: TestingCenterChannel | null;
  children: ReactNode;
};

function resolveSimStatus(source: TelemetrySourceStatus | null | undefined): SimStatus {
  if (!source) return "disconnected";
  if (source.live && source.available) return "connected";
  if (source.live) return "searching";
  return "disconnected";
}

export function OrbitShell(props: OrbitShellProps) {
  // El proveedor de toasts es del kit (`ui/orbit/Toast`): la shell solo lo monta
  // y consume `useToast`, para que las pantallas compartan la misma región.
  return (
    <ToastProvider>
      <OrbitShellBody {...props} />
    </ToastProvider>
  );
}

function OrbitShellBody({
  activeSection,
  onNavigate,
  version,
  sourceStatus,
  testingCenterChannel,
  children,
}: OrbitShellProps) {
  const { t } = useI18n();
  const access = useAccess();
  const { result: license } = useLicense();
  const overlay = useOverlayState();
  const races = useCalendarStarts();
  const launcher = useLauncherSnapshot();

  const activeView = sectionToView(activeSection);
  const planLabel = planLabelOf(access);

  const [columnOpen, setColumnOpen] = useState(
    () => orbitStore.get(ORBIT_KEYS.sidebar) !== "closed",
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const toastApi = useToast();
  const [update, setUpdate] = useState<UpdateState>("none");
  const [updateTag, setUpdateTag] = useState<string>("");

  // El tema Orbit solo se aplica mientras la shell está montada y **no** se
  // guarda como preferencia: al apagar el flag vuelve el tema del usuario.
  useEffect(() => applyOrbitThemeWhileMounted(), []);

  // Actualización: misma señal que UpdateBanner, sin duplicar su UI.
  useEffect(() => {
    const unsubNotify = Events.On("updater:notify", (event: { data?: { tag?: string } }) => {
      setUpdateTag(event.data?.tag ?? "");
      setUpdate("available");
    });
    const unsubProgress = Events.On("updater:progress", () => setUpdate("downloading"));
    const unsubReady = Events.On("updater:ready", () => setUpdate("ready"));
    return () => {
      unsubNotify?.();
      unsubProgress?.();
      unsubReady?.();
    };
  }, []);

  // ≤ 1152 px la columna se pliega sola sin tocar la preferencia guardada.
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= AUTO_COLLAPSE_WIDTH,
  );
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= AUTO_COLLAPSE_WIDTH);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const effectiveColumnOpen = columnOpen && !narrow;

  const toast = useCallback(
    (title: string, message?: string) => toastApi.show(title, message),
    [toastApi],
  );

  const toggleColumn = useCallback(() => {
    setColumnOpen((open) => {
      const next = !open;
      orbitStore.set(ORBIT_KEYS.sidebar, next ? "open" : "closed");
      return next;
    });
  }, []);

  const navigate = useCallback(
    (view: ViewId, target?: string) => {
      if (!canSeeView(access, view)) {
        toast(
          t("shell.access.unavailable"),
          formatMessage(t("shell.access.requiresPlan"), {
            plan: REQUIRED_PLAN[view] ?? planLabel,
            current: planLabel,
          }),
        );
        return;
      }
      orbitStore.set(ORBIT_KEYS.view, view);
      onNavigate(viewToSection(view), target);
    },
    [access, onNavigate, planLabel, t, toast],
  );

  const railItems: RailItem[] = useMemo(
    () =>
      RAIL_ORDER.filter((entry) => entry.id !== "testing" || Boolean(testingCenterChannel)).map(
        (entry) => {
          const allowed = canSeeView(access, entry.id);
          const soon = entry.id === "telemetria";
          return {
            id: entry.id,
            icon: entry.icon,
            label: soon ? t("shell.rail.telemetrySoon") : t(RAIL_LABEL_KEY[entry.id]),
            soon,
            locked: allowed
              ? undefined
              : { requiredPlan: REQUIRED_PLAN[entry.id] ?? planLabel, currentPlan: planLabel },
          };
        },
      ),
    [access, planLabel, t, testingCenterChannel],
  );

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

  const launcherProfiles = useMemo(() => {
    const all = [...(launcher?.userProfiles ?? []), ...(launcher?.vantareProfiles ?? [])];
    return all.map((profile) => ({
      id: profile.id,
      name: profile.name,
      steps: profile.steps?.length ?? 0,
    }));
  }, [launcher]);

  const blocks: ContextColumnBlock[] = useMemo(
    () => [
      {
        id: "races",
        hiddenFor: ["carreras"],
        content: (
          <SideRaces
            labels={{
              title: t("shell.column.nextRaces"),
              seeAll: t("shell.column.seeAll"),
              in: t("shell.column.in"),
              empty: t("shell.column.noRaces"),
            }}
            onSeeAll={() => navigate("carreras")}
            onSelect={(seriesId) => navigate("carreras", seriesId)}
            starts={races.starts}
          />
        ),
      },
      {
        id: "profile",
        hiddenFor: ["studio"],
        content: (
          <SideProfile
            active={overlay.active}
            labels={{
              title: t("shell.column.overlayProfile"),
              stopped: t("shell.column.stopped"),
              live: t("shell.column.live"),
              widgets: t("shell.column.widgets"),
              active: t("shell.column.active"),
              recommended: t("shell.column.recommended"),
              empty: t("shell.column.noProfiles"),
            }}
            onActivate={() => navigate("studio")}
            onOpenStudio={() => navigate("studio")}
            onToggleOverlay={toggleOverlay}
            recommended={overlay.recommended}
            running={overlay.running}
          />
        ),
      },
      {
        id: "launcher",
        hiddenFor: ["launcher"],
        content: (
          <SideLauncher
            labels={{
              title: t("shell.column.launcher"),
              manage: t("shell.column.manage"),
              steps: t("shell.column.steps"),
              empty: t("shell.column.noProfiles"),
            }}
            onManage={() => navigate("launcher")}
            onRun={(profileId) => Events.Emit("launcher:profile:run", { profileId })}
            profiles={launcherProfiles}
          />
        ),
      },
    ],
    [launcherProfiles, navigate, overlay.active, overlay.recommended, overlay.running, races.starts, t, toggleOverlay],
  );

  // El contexto por sección lo rellena cada briefing de pantalla. Inicio no
  // lleva slot propio (la referencia deja los bloques pegados a la cabecera).
  // Studio sí: la shell reserva el hueco y la propia pantalla porta ahí su
  // lista de widgets, que necesita el store del Studio (briefing 04).
  const contextNode: ReactNode =
    activeView === "studio" ? (
      <div className="orbit-column__slot" id="orbit-studio-context-slot" />
    ) : activeView === "launcher" ? (
      <div className="orbit-column__slot" id={LAUNCHER_CONTEXT_SLOT_ID} />
    ) : null;
  const visibleBlockCount =
    activeView === "ajustes"
      ? 0
      : blocks.filter((block) => !block.hiddenFor.includes(activeView)).length;
  const columnAvailable = Boolean(contextNode) || visibleBlockCount > 0;

  const destinations: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = railItems.map((item) => ({
      id: item.id,
      label: item.label,
      meta: t(`shell.topbar.eyebrow.${item.id}`),
      icon: item.icon,
      locked: item.locked
        ? formatMessage(t("shell.access.requiresPlanShort"), { plan: item.locked.requiredPlan })
        : undefined,
      run: () => navigate(item.id),
    }));
    items.push({
      id: "ajustes",
      label: t("shell.rail.settings"),
      meta: t("shell.topbar.eyebrow.ajustes"),
      icon: "i-ajustes",
      locked: undefined,
      run: () => navigate("ajustes", "application"),
    });
    items.push({
      id: "cuenta",
      label: t("shell.palette.account"),
      meta: t("shell.palette.accountMeta"),
      icon: "i-cuenta",
      locked: undefined,
      run: () => navigate("ajustes", "account"),
    });
    return items;
  }, [navigate, railItems, t]);

  const actions: PaletteItem[] = useMemo(
    () => [
      {
        id: "toggle-overlay",
        label: t("shell.palette.toggleOverlay"),
        meta: overlay.active?.name ?? "",
        icon: "i-studio",
        run: toggleOverlay,
      },
      {
        id: "save-profile",
        label: t("shell.palette.saveProfile"),
        meta: t("shell.rail.studio"),
        icon: "i-studio",
        run: () => Events.Emit("studio:save"),
      },
    ],
    [overlay.active?.name, t, toggleOverlay],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const simStatus = resolveSimStatus(sourceStatus);
  const accountLabel = formatMessage(t("shell.rail.account"), { plan: planLabel });
  const updateLabel =
    update === "ready"
      ? t("shell.update.ready")
      : update === "downloading"
        ? formatMessage(t("shell.update.downloading"), { pct: 0 })
        : formatMessage(t("shell.update.available"), { v: updateTag });

  const shell = (
    <div className="orbit-root" data-testid="orbit-shell">
      <div className="orbit-shell" data-column={effectiveColumnOpen && columnAvailable ? "open" : "closed"}>
        <Rail
          active={activeView}
          avatarSrc={undefined}
          columnAvailable={columnAvailable}
          columnOpen={effectiveColumnOpen}
          items={railItems}
          labels={{
            rail: t("shell.rail.label"),
            brand: t("shell.rail.brand"),
            palette: t("shell.rail.palette"),
            settings: t("shell.rail.settings"),
            account: accountLabel,
            toggleColumn: t("shell.rail.toggleColumn"),
            toggleColumnHide: t("shell.rail.toggleColumnHide"),
            noContext: t("shell.rail.noContext"),
            requiresPlan: formatMessage(t("shell.access.requiresPlan"), {
              plan: REQUIRED_PLAN[activeView] ?? planLabel,
              current: planLabel,
            }),
          }}
          onNavigate={navigate}
          onToggleColumn={toggleColumn}
          onTogglePalette={() => setPaletteOpen((open) => !open)}
          planLabel={license?.email?.charAt(0).toUpperCase() || planLabel}
        />

        {effectiveColumnOpen && columnAvailable ? (
          <ContextColumn
            activeView={activeView}
            blocks={blocks}
            context={contextNode}
            labels={{
              column: t("shell.column.label"),
              collapse: t("shell.column.collapse"),
              sim: t(`shell.sim.${simStatus}`),
              simTitle: simStatus === "connected" ? t("shell.sim.connectedTitle") : undefined,
            }}
            onCollapse={toggleColumn}
            onOpenAccount={() => navigate("ajustes", "account")}
            planLabel={planLabel}
            simStatus={simStatus}
            title={t(`shell.title.${activeView}`)}
            version={version ?? ""}
          />
        ) : (
          <div />
        )}

        <div className="orbit-main">
          <Topbar
            eyebrow={t(`shell.topbar.eyebrow.${activeView}`)}
            onUpdate={() => Events.Emit("updater:install")}
            title={t(RAIL_LABEL_KEY[activeView])}
            update={update}
            updateLabel={updateLabel}
            view={activeView}
          >
            {activeView === "studio" ? (
              <div className="orbit-topbar__slot" id="orbit-studio-topbar-slot" />
            ) : activeView === "launcher" ? (
              <div className="orbit-topbar__slot" id={LAUNCHER_TOPBAR_SLOT_ID} />
            ) : null}
          </Topbar>
          <div className="orbit-workspace">
            {activeView === "inicio" ? (
              <HomeOrbitPage
                onActivateProfile={(profile) =>
                  Events.Emit("hub:set-active", { id: profile.id, file: profile.file })
                }
                onNavigate={navigate}
                onOpenPalette={() => setPaletteOpen(true)}
                onToggleOverlay={toggleOverlay}
                overlay={overlay}
                races={races.starts}
                simStatus={simStatus}
                target={races.target}
                userName={license?.email?.split("@")[0]}
              />
            ) : activeView === "launcher" ? (
              <LauncherOrbitPage />
            ) : (
              children
            )}
          </div>
        </div>
      </div>

      <CommandPalette
        actions={actions}
        destinations={destinations}
        labels={{
          title: t("shell.palette.title"),
          placeholder: t("shell.palette.placeholder"),
          goTo: t("shell.palette.goTo"),
          actions: t("shell.palette.actions"),
          footNav: t("shell.palette.foot.nav"),
          footRun: t("shell.palette.foot.run"),
          footLocked: t("shell.palette.foot.locked"),
        }}
        onBlocked={(item) => toast(t("shell.access.unavailable"), item.locked)}
        onClose={() => setPaletteOpen(false)}
        open={paletteOpen}
      />
    </div>
  );

  // El estado del sim se publica para toda la shell: el Pill LMU de la columna
  // y el selector Mock/Live del Studio leen el mismo `simStatus`.
  return <OrbitSimStatusContext.Provider value={simStatus}>{shell}</OrbitSimStatusContext.Provider>;
}
