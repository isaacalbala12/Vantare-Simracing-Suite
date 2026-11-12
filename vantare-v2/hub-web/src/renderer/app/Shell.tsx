import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import {
  type CoreStatus,
  defaultZoom,
  type LauncherView,
  type Palette,
  palettes,
} from "../../contract/generated/contract";
import { zoomStep } from "../../window-zoom";
import { Icon } from "../assets/icons/Icon";

import { accountText } from "../i18n/account.es";
import { commandsText } from "../i18n/commands.es";
import { paletteNames, t } from "../i18n/es";
import { shellText } from "../i18n/shell.es";
import { upcoming } from "../i18n/upcoming";
import { zoomText } from "../i18n/zoom.es";
import { RendererQa } from "../qa/entry";
import { NotificationsPopover } from "../screens/notifications/NotificationsPopover";
import { NotificationsProvider } from "../screens/notifications/NotificationsState";
import { Button, IconButton } from "../ui/Button";
import { Avatar, Badge, Callout } from "../ui/Data";
import { Select } from "../ui/Forms";
import {
  CommandPalette,
  ContextRail,
  PageHeader,
  Sidebar,
  TitleBar,
} from "../ui/Frame";
import { hubShortcut, isZoomAction } from "../ui/hub-shortcuts";
import { initials } from "../ui/initials";
import { ToastViewport } from "../ui/Layers";
import { SaveWarnings } from "../ui/SaveWarnings";
import {
  ActionGroup,
  ContentStack,
  InfoList,
  ShellLayout,
} from "../ui/ShellLayout";
import { TrackedCaps } from "../ui/TrackedCaps";
import { currentZoomLimit, useWindowZoomLimit } from "../ui/window-zoom";
import { useAccountSession } from "./AccountSession";
import { useAccount } from "./AccountState";
import { coreKey, offline, useHost } from "./Host";
import { launcherAccess, useLauncherLaunch } from "./LauncherLaunch";
import { isSection, lock, navigation, visible } from "./navigation";
import { profileCommands } from "./profile-commands";
import { RegisteredScreen } from "./ScreenRegistry";
import { useSettings } from "./SettingsState";
import { type Section, useUi } from "./UiState";
import { WindowControls } from "./WindowControls";

export function Shell() {
  return (
    <NotificationsProvider>
      <ShellContent />
    </NotificationsProvider>
  );
}
function ShellContent() {
  const zoomLimit = useWindowZoomLimit();
  const host = useHost();
  const query = useQueryClient();
  const settings = useSettings();
  const editBlocked =
    !settings.view ||
    settings.pending ||
    settings.view.protected ||
    Boolean(settings.error);
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  // AccountProvider already sequences reads against publications and access intents.
  // A second cache here could let an old GET overwrite the new account's identity.
  const session = useAccountSession();
  const { confirmed } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const { value } = useAccount();
  const account = confirmed ? value : undefined;
  useEffect(() => {
    const off = host.client?.listen((message) => {
      if (message.kind === "event" && message.event.topic === "launcher")
        query.setQueryData(["launcher"], message.event.value);
    });
    const unsubscribe = host.client?.subscribe("launcher");
    return () => {
      off?.();
      unsubscribe?.();
    };
  }, [host.client, query]);
  // QA identity stays separate from both account data and the editable pilot draft.
  const profileName = host.hello?.demo
    ? (host.hello.demoName ?? "")
    : account?.session === "signedIn"
      ? account.name
      : "";
  const profilePhoto =
    !host.hello?.demo && account?.session === "signedIn"
      ? (account.photo ?? undefined)
      : undefined;
  const ui = useUi((state) => state);
  // The frame retains its subscription across screen changes.
  const {
    data: launcher,
    isFetching: launcherLoading,
    isError: launcherFailed,
    refetch: refreshLauncher,
  } = useQuery<LauncherView>({
    queryKey: ["launcher"],
    enabled:
      !!host.client &&
      (ui.commandsOpen ||
        (!ui.sidebarCollapsed && ui.section !== "launcher")) &&
      !core.live,
    queryFn: async () => {
      if (!host.client) throw new Error("Host unavailable");
      const reply = await host.client.request({ method: "launcher.get" });
      if (reply.method !== "launcher.get")
        throw new Error("Unexpected launcher reply");
      return reply.value;
    },
  });
  useEffect(() => {
    if (ui.commandsOpen && host.client && !core.live)
      void refreshLauncher({ cancelRefetch: false });
  }, [ui.commandsOpen, host.client, core.live, refreshLauncher]);
  const { launchFavorite, launchProfile, pending: profileWaiting } = useLauncherLaunch(core, launcher);
  const isUpcoming = (section: Section) =>
    section === "strategy" || section === "engineer";
  const items = navigation(core.access).map((item) =>
    isUpcoming(item.id)
      ? {
          ...item,
          locked: undefined,
          label:
            item.id === "strategy"
              ? shellText.strategyName
              : shellText.engineerName,
          lockBadge: true,
          badge: (
            <span className="v-nav-soon">
              <Icon name="v-lock" />
              {upcoming.soon}
            </span>
          ),
        }
      : item.id === "studio"
        ? { ...item, label: shellText.studioName }
        : item.id === "launcher"
          ? {
              ...item,
              badge: launcher?.profiles.length ? (
                <span className="v-nav-count">{launcher.profiles.length}</span>
              ) : undefined,
            }
          : item,
  );
  function navigate(section: Section) {
    if (
      isUpcoming(section) ||
      (visible(section, core.access) && !lock(section, core.access))
    )
      ui.navigate(section);
  }
  function zoom(direction: -1 | 0 | 1) {
    if (
      !settings.view ||
      settings.pending ||
      settings.view.protected ||
      settings.error
    )
      return;
    const value = zoomStep(settings.view.zoom, direction, currentZoomLimit());
    if (value !== settings.view.zoom) settings.update({ field: "zoom", value });
  }
  function toggleTheme() {
    if (
      settings.view &&
      !settings.pending &&
      !settings.view.protected &&
      !settings.error
    )
      settings.update({
        field: "scheme",
        value:
          document.documentElement.dataset.scheme === "dark" ? "light" : "dark",
      });
  }
  useEffect(() => {
    if (!visible(ui.section, core.access)) ui.navigate("home");
  }, [ui.section, ui.navigate, core.access]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        ui.commands(false);
        ui.notices(false);
        return;
      }
      const action = hubShortcut(event);
      if (!action) return;
      if (action === "commands") {
        event.preventDefault();
        ui.commands(!ui.commandsOpen);
        return;
      }
      // Zoom applies to the whole window, including an editable field or a
      // nested Select. The normal settings/viewport guards still own the write.
      if (isZoomAction(action)) {
        event.preventDefault();
        zoom(action === "zoomReset" ? 0 : action === "zoomOut" ? -1 : 1);
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            "input,textarea,select,[role=textbox],[role=combobox]",
          ))
      )
        return;
      event.preventDefault();
      if (action === "sidebar") ui.toggleSidebar();
      if (action === "context") ui.toggleRail();
      if (action === "notifications") ui.notices(!ui.noticesOpen);
      if (action === "launch") void launchFavorite();
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const status = core.live
    ? shellText.simulatorConnected
    : shellText.waitingSimulator;
  const launchBlocked =
    launcherAccess(core) ??
    (core.live
      ? commandsText.live
      : launcherFailed
        ? commandsText.readFailed
        : launcherLoading
          ? commandsText.loading
          : profileWaiting
            ? commandsText.pending
            : undefined);
  const settingsBlocked = !editBlocked
    ? undefined
    : settings.pending
      ? commandsText.settingsSaving
      : settings.error
        ? commandsText.settingsError
        : settings.view?.protected
          ? commandsText.settingsProtected
          : commandsText.settingsLoading;
  function zoomReason(direction: -1 | 0 | 1) {
    if (editBlocked || !settings.view) return settingsBlocked;
    if (direction === 0)
      return defaultZoom > zoomLimit ? zoomText.resetUnavailable : undefined;
    if (
      zoomStep(settings.view.zoom, direction, zoomLimit) === settings.view.zoom
    )
      return direction < 0
        ? zoomText.lessUnavailable
        : zoomText.moreUnavailable;
    return undefined;
  }
  const title =
    items.find((item) => item.id === ui.section)?.label ??
    (ui.section === "account" ? accountText.title : t("settings.title"));
  const groups = [
    {
      label: "",
      items: items.filter((item) =>
        ["home", "launcher", "studio", "roadmap", "testing"].includes(item.id),
      ),
    },
    {
      label: t("shell.testers"),
      badge: core.access.tester ? shellText.testerBadge : undefined,
      items: items.filter((item) => item.id === "calendar"),
    },
    {
      label: t("shell.modules"),
      items: items.filter(
        (item) => item.id === "strategy" || item.id === "engineer",
      ),
    },
  ].filter((group) => group.items.length);
  return (
    <ShellLayout
      toasts={<ToastViewport closeLabel={t("shell.close")} inline />}
      header={
        <TitleBar
          title={title}
          status={status}
          controls={<WindowControls />}
          actions={
            <ActionGroup>
              <IconButton
                label={t("shell.railToggle")}
                aria-expanded={!ui.railCollapsed}
                onClick={ui.toggleRail}
              >
                <Icon name="v-side" />
              </IconButton>
              <CommandPalette
                title={t("shell.commands")}
                description={t("shell.commandsHelp")}
                trigger={null}
                empty={t("shell.emptyCommands")}
                notice={launcherFailed ? commandsText.readFailed : undefined}
                commands={[
                  ...[
                    "home",
                    "studio",
                    "launcher",
                    "calendar",
                    "strategy",
                    "engineer",
                    "roadmap",
                    "testing",
                    "settings",
                  ]
                    .flatMap((id) => items.filter((item) => item.id === id))
                    .map((item) => ({
                      id: item.id,
                      label:
                        item.id === "strategy"
                          ? commandsText.strategy
                          : item.id === "engineer"
                            ? commandsText.engineer
                            : item.label,
                      group: "navigation" as const,
                      icon: item.icon,
                      meta: isUpcoming(item.id)
                        ? core.access.verified &&
                          !core.access.blocked &&
                          // PlanView::Founders is Rust's projection of the
                          // verified LaunchV1 catalog (account/mod.rs).
                          account?.plan?.kind === "founders"
                          ? commandsText.included
                          : commandsText.soon
                        : (item.locked ??
                          commandsText.meta[
                            item.id as keyof typeof commandsText.meta
                          ]),
                      trail:
                        commandsText.meta[
                          item.id as keyof typeof commandsText.meta
                        ],
                      locked: isUpcoming(item.id),
                      disabled: isUpcoming(item.id)
                        ? false
                        : !!lock(item.id, core.access),
                      run: () => navigate(item.id),
                    })),
                  ...(
                    [
                      {
                        id: "account",
                        label: commandsText.account,
                        meta: commandsText.accountMeta,
                        icon: "i-cuenta",
                      },
                      {
                        id: "notifications",
                        label: commandsText.notifications,
                        meta: commandsText.notificationsMeta,
                        icon: "v-bell",
                      },
                    ] as const
                  ).map((item) => ({
                    ...item,
                    trail: item.meta,
                    meta: lock(item.id, core.access) ?? item.meta,
                    group: "navigation" as const,
                    disabled: !!lock(item.id, core.access),
                    run: () => navigate(item.id),
                  })),
                  {
                    id: "theme",
                    label: t("shell.toggleTheme"),
                    icon: "v-palette",
                    meta: settingsBlocked,
                    disabled: editBlocked,
                    run: toggleTheme,
                  },
                  {
                    id: "sidebar",
                    label: t("shell.sidebar"),
                    icon: "v-side",
                    shortcut: commandsText.shortcut.sidebar,
                    run: ui.toggleSidebar,
                  },
                  {
                    id: "rail",
                    label: commandsText.context,
                    meta: commandsText.contextMeta,
                    icon: "v-side",
                    shortcut: commandsText.shortcut.context,
                    run: ui.toggleRail,
                  },
                  {
                    id: "notices",
                    label: t("shell.notices"),
                    icon: "v-bell",
                    shortcut: commandsText.shortcut.notices,
                    run: () => ui.notices(true),
                  },
                  {
                    id: "zoom-less",
                    label: t("general.zoomLess"),
                    meta: zoomReason(-1),
                    shortcut: commandsText.shortcut.zoomOut,
                    disabled:
                      editBlocked ||
                      !settings.view ||
                      zoomStep(settings.view.zoom, -1, zoomLimit) ===
                        settings.view.zoom,
                    run: () => zoom(-1),
                  },
                  {
                    id: "zoom-more",
                    label: t("general.zoomMore"),
                    meta: zoomReason(1),
                    shortcut: commandsText.shortcut.zoomIn,
                    disabled:
                      editBlocked ||
                      !settings.view ||
                      zoomStep(settings.view.zoom, 1, zoomLimit) ===
                        settings.view.zoom,
                    run: () => zoom(1),
                  },
                  {
                    id: "zoom-reset",
                    label: t("general.zoomReset"),
                    meta: zoomReason(0),
                    shortcut: commandsText.shortcut.zoomReset,
                    disabled: editBlocked || defaultZoom > zoomLimit,
                    run: () => zoom(0),
                  },
                  {
                    id: "favorite",
                    label: t("shell.favorite"),
                    icon: "v-launch",
                    shortcut: commandsText.shortcut.launch,
                    meta:
                      launchBlocked ??
                      (launcher?.running
                        ? commandsText.running
                        : commandsText.profile),
                    disabled: !!launchBlocked || !!launcher?.running,
                    run: () => void launchFavorite(),
                  },
                  {
                    id: "close",
                    label: t("shell.closeHub"),
                    icon: "i-ajustes",
                    run: () => host.client?.closeWindow(),
                  },
                  ...profileCommands(
                    launcher,
                    launchBlocked,
                    (profile, revision) =>
                      void launchProfile(profile, revision),
                  ),
                ]}
                open={ui.commandsOpen}
                onOpenChange={ui.commands}
              />
              <NotificationsPopover />
            </ActionGroup>
          }
        />
      }
      sidebar={
        <Sidebar
          label={t("shell.navigation")}
          groups={groups}
          active={ui.section}
          collapsed={ui.sidebarCollapsed}
          toggle={{ label: shellText.sidebarCollapse, run: ui.toggleSidebar }}
          profiles={
            launcher?.profiles.length ? (
              <section
                className="v-sidebar-profiles"
                aria-label={shellText.profiles}
              >
                <div className="v-nav-heading">
                  <TrackedCaps>{shellText.profiles}</TrackedCaps>
                  <span>{launcher.profiles.length}</span>
                </div>
                <div className="v-sidebar-profile-list">
                  {launcher.profiles.map((profile) => (
                    <Button
                      variant="ghost"
                      className="v-sidebar-profile"
                      key={profile.id}
                      aria-label={shellText.launchProfile(profile.name)}
                      onClick={() => {
                        void launchProfile(profile.id, launcher.revision);
                      }}
                    >
                      <span className="v-sidebar-profile-dot" />
                      <span className="v-sidebar-profile-copy">
                        <span>{profile.name}</span>
                        <small>
                          {profile.apps
                            .map(
                              (id) =>
                                launcher.apps.find((app) => app.id === id)
                                  ?.name ?? id,
                            )
                            .join(" → ")}
                        </small>
                      </span>
                    </Button>
                  ))}
                </div>
              </section>
            ) : undefined
          }
          onSelect={(id) => {
            if (isSection(id)) navigate(id);
          }}
          footer={
            ui.sidebarCollapsed ? (
              <ContentStack>
                <ActionGroup>
                  <IconButton
                    label={t("shell.sidebar")}
                    onClick={ui.toggleSidebar}
                    aria-expanded={!ui.sidebarCollapsed}
                  >
                    <Icon name="v-side" />
                  </IconButton>
                  <IconButton
                    label={t("shell.toggleTheme")}
                    className="v-theme-toggle"
                    onClick={toggleTheme}
                    disabled={editBlocked}
                  >
                    <Icon name="v-palette" />
                  </IconButton>
                </ActionGroup>
                <Button
                  variant="ghost"
                  aria-current={ui.section === "settings" ? "page" : undefined}
                  aria-label={t("settings.title")}
                  onClick={() => navigate("settings")}
                >
                  <Icon name="i-ajustes" />
                  {!ui.sidebarCollapsed && t("settings.title")}
                </Button>
                <Button
                  variant="ghost"
                  className="v-account-link"
                  aria-label={accountText.title}
                  aria-current={ui.section === "account" ? "page" : undefined}
                  onClick={() => navigate("account")}
                >
                  <Avatar
                    label={profileName || t("shell.anonymous")}
                    initials={initials(profileName)}
                    src={profilePhoto}
                  />
                  {!ui.sidebarCollapsed &&
                    (profileName || t("shell.anonymous"))}
                  <Badge>{t("shell.beta")}</Badge>
                </Button>
              </ContentStack>
            ) : (
              <div className="v-sidebar-expanded-footer">
                <Button
                  variant="ghost"
                  className="v-sidebar-footer-row"
                  aria-expanded
                  onClick={ui.toggleSidebar}
                >
                  <Icon name="v-side" />
                  <span className="v-nav-name">
                    {shellText.sidebarCollapse}
                  </span>
                  <kbd>{t("shell.ctrlB")}</kbd>
                </Button>
                <div className="v-sidebar-palette">
                  <Icon name="v-palette" />
                  <Select
                    hideLabel
                    label={t("appearance.themes")}
                    value={settings.view?.appearance.palette ?? "vantare"}
                    options={palettes.map((value) => ({
                      value,
                      label: paletteNames[value],
                    }))}
                    disabled={editBlocked}
                    pending={settings.pending}
                    onChange={(value) => {
                      if (palettes.includes(value as Palette))
                        settings.update({
                          field: "palette",
                          value: value as Palette,
                        });
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  className="v-sidebar-footer-row"
                  aria-label={t("settings.title")}
                  aria-current={ui.section === "settings" ? "page" : undefined}
                  onClick={() => navigate("settings")}
                >
                  <Icon name="v-sliders" />
                  <span>{t("settings.title")}</span>
                </Button>
                <Button
                  variant="ghost"
                  className="v-sidebar-account"
                  aria-label={accountText.title}
                  aria-current={ui.section === "account" ? "page" : undefined}
                  onClick={() => navigate("account")}
                >
                  <Avatar
                    label={profileName || t("shell.anonymous")}
                    initials={initials(profileName)}
                    src={profilePhoto}
                  />
                  <span className="v-sidebar-account-copy">
                    <span>{profileName || t("shell.anonymous")}</span>
                    <small>
                      <b>{t("shell.beta")}</b>
                      {core.access.tester
                        ? shellText.testerAccess
                        : shellText.freeBeta}
                    </small>
                  </span>
                  <Icon name="right" />
                </Button>
              </div>
            )
          }
        />
      }
      rail={
        isUpcoming(ui.section) ? null : (
          <ContextRail
            label={t("shell.rail")}
            collapsed={ui.railCollapsed}
            onToggle={ui.toggleRail}
            toggleLabel={t("shell.railToggle")}
          >
            <ContentStack>
              <InfoList
                items={[
                  {
                    label: t("shell.version"),
                    value: settings.view?.version ?? t("settings.loading"),
                  },
                  { label: t("shell.shortcuts"), value: t("shell.ctrlK") },
                  { label: t("shell.sidebar"), value: t("shell.ctrlB") },
                  { label: t("shell.railToggle"), value: t("shell.ctrlAltB") },
                  { label: t("general.zoom"), value: t("shell.ctrlZoom") },
                ]}
              />
            </ContentStack>
          </ContextRail>
        )
      }
    >
      <ContentStack>
        {ui.section !== "settings" && (
          <SaveWarnings onSettings={() => ui.navigate("settings")} />
        )}
        <RegisteredScreen
          section={ui.section}
          loading={t("settings.loading")}
          fallback={
            <ContentStack>
              <PageHeader title={title} />
              <Callout title={t("shell.soon")} />
            </ContentStack>
          }
        />
        <RendererQa />
      </ContentStack>
    </ShellLayout>
  );
}
