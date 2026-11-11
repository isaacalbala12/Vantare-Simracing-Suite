import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  defaultZoom,
  type LauncherView,
  type Palette,
  palettes,
} from "../../contract/generated/contract";
import { Icon } from "../assets/icons/Icon";
import { paletteNames, t } from "../i18n/es";
import { shellText } from "../i18n/shell.es";
import { upcoming } from "../i18n/upcoming";
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
import { initials } from "../ui/initials";
import { ToastViewport, useToastManager } from "../ui/Layers";
import { SaveWarnings } from "../ui/SaveWarnings";
import {
  ActionGroup,
  ContentStack,
  InfoList,
  ShellLayout,
} from "../ui/ShellLayout";
import { TrackedCaps } from "../ui/TrackedCaps";
import { zoomLevels } from "../ui/ZoomControl";
import { coreKey, offline, useHost } from "./Host";
import { isSection, lock, navigation, visible } from "./navigation";
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
  const host = useHost();
  const query = useQueryClient();
  // QA identity is separate from the editable pilot draft. Production remains anonymous until Access.
  const profileName = host.hello?.demo ? (host.hello.demoName ?? "") : "";
  const toast = useToastManager();
  const settings = useSettings();
  const favoritePending = useRef(false);
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
  const ui = useUi((state) => state);
  // Read the existing launcher snapshot for the expanded frame. The screen owns
  // its subscription; this reader never unsubscribes it or writes a profile.
  const { data: launcher } = useQuery<LauncherView>({
    queryKey: ["launcher"],
    enabled:
      !!host.client &&
      !ui.sidebarCollapsed &&
      ui.section !== "launcher" &&
      !core.live,
    queryFn: async () => {
      if (!host.client) throw new Error("Host unavailable");
      const reply = await host.client.request({ method: "launcher.get" });
      if (reply.method !== "launcher.get")
        throw new Error("Unexpected launcher reply");
      return reply.value;
    },
  });
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
  async function launchFavorite() {
    if (!host.client || favoritePending.current) return;
    favoritePending.current = true;
    try {
      const reply = await host.client.request({ method: "launcher.favorite" });
      if (reply.method !== "launcher.favorite") return;
      if (!reply.accepted) {
        navigate("launcher");
        toast.add({ title: t("shell.profileNeeded") });
      } else toast.add({ title: t("shell.favoriteSent") });
    } catch {
      toast.add({ title: t("shell.favoriteFailed"), type: "err" });
    } finally {
      favoritePending.current = false;
    }
  }
  function zoom(direction: -1 | 0 | 1) {
    if (
      !settings.view ||
      settings.pending ||
      settings.view.protected ||
      settings.error
    )
      return;
    const index = zoomLevels.indexOf(settings.view.zoom);
    const value =
      direction === 0
        ? defaultZoom
        : zoomLevels[
            Math.max(0, Math.min(zoomLevels.length - 1, index + direction))
          ];
    settings.update({ field: "zoom", value });
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
      const key = event.key.toLowerCase();
      if (key === "escape") {
        ui.commands(false);
        ui.notices(false);
        return;
      }
      if (!event.ctrlKey || event.metaKey) return;
      if (key === "k") {
        event.preventDefault();
        ui.commands(!ui.commandsOpen);
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
      if (key === "b") {
        event.preventDefault();
        if (event.altKey) ui.toggleRail();
        else ui.toggleSidebar();
      }
      if (key === "n" && event.shiftKey) {
        event.preventDefault();
        ui.notices(!ui.noticesOpen);
      }
      if (key === "l") {
        event.preventDefault();
        if (!event.repeat) void launchFavorite();
      }
      if (
        ["+", "=", "-", "0"].includes(key) &&
        settings.view &&
        !settings.pending &&
        !settings.view.protected &&
        !settings.error
      ) {
        event.preventDefault();
        zoom(key === "0" ? 0 : key === "-" ? -1 : 1);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const status = core.live
    ? shellText.simulatorConnected
    : shellText.waitingSimulator;
  const title =
    items.find((item) => item.id === ui.section)?.label ?? t("settings.title");
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
                <Icon name="i-panel" />
              </IconButton>
              <CommandPalette
                title={t("shell.commands")}
                description={t("shell.commandsHelp")}
                trigger={null}
                closeLabel={t("shell.close")}
                empty={t("shell.emptyCommands")}
                commands={[
                  ...items.map((item) => ({
                    id: item.id,
                    label: item.label,
                    disabled: !!item.locked,
                    run: () => navigate(item.id),
                  })),
                  {
                    id: "theme",
                    label: t("shell.toggleTheme"),
                    disabled: editBlocked,
                    run: toggleTheme,
                  },
                  {
                    id: "sidebar",
                    label: t("shell.sidebar"),
                    run: ui.toggleSidebar,
                  },
                  {
                    id: "rail",
                    label: t("shell.railToggle"),
                    run: ui.toggleRail,
                  },
                  {
                    id: "notices",
                    label: t("shell.notices"),
                    run: () => ui.notices(true),
                  },
                  {
                    id: "zoom-less",
                    label: t("general.zoomLess"),
                    disabled: editBlocked,
                    run: () => zoom(-1),
                  },
                  {
                    id: "zoom-more",
                    label: t("general.zoomMore"),
                    disabled: editBlocked,
                    run: () => zoom(1),
                  },
                  {
                    id: "zoom-reset",
                    label: t("general.zoomReset"),
                    disabled: editBlocked,
                    run: () => zoom(0),
                  },
                  {
                    id: "favorite",
                    label: t("shell.favorite"),
                    disabled: !!lock("launcher", core.access),
                    run: () => void launchFavorite(),
                  },
                  {
                    id: "close",
                    label: t("shell.closeHub"),
                    run: () => host.client?.closeWindow(),
                  },
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
                      aria-label={shellText.openProfile(profile.name)}
                      onClick={() => {
                        query.setQueryData(
                          ["launcher", "selection"],
                          profile.id,
                        );
                        navigate("launcher");
                      }}
                    >
                      <span className="v-sidebar-profile-dot" />
                      <span className="v-sidebar-profile-copy">
                        <span>{profile.name}</span>
                        <small>{profile.apps.join(" → ")}</small>
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
                    <Icon name="i-panel" />
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
                <ActionGroup>
                  <Avatar
                    label={profileName || t("shell.anonymous")}
                    initials={initials(profileName)}
                  />
                  {!ui.sidebarCollapsed &&
                    (profileName || t("shell.anonymous"))}
                  <Badge>{t("shell.beta")}</Badge>
                </ActionGroup>
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
                  aria-label={profileName || t("shell.anonymous")}
                  onClick={() => navigate("account")}
                >
                  <Avatar
                    label={profileName || t("shell.anonymous")}
                    initials={initials(profileName)}
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
      </ContentStack>
    </ShellLayout>
  );
}
