import { lazy, Suspense, useState } from "react";
import { usePilot } from "../../app/PilotState";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { useSettings } from "../../app/SettingsState";
import { settingsText, t } from "../../i18n/es";
import { settingsDescriptions } from "../../i18n/settings-frame.es";
import { AppearanceGroups } from "../../ui/AppearanceGroups";
import { Button } from "../../ui/Button";
import { Callout, Skeleton } from "../../ui/Data";
import { SearchInput } from "../../ui/Forms";
import { SectionPageHeader, StatusAnnouncement } from "../../ui/Frame";
import { ShortcutGroups } from "../../ui/SettingActions";
import { ActionGroup, ContentStack } from "../../ui/ShellLayout";
import { UpdatesRailContent } from "../../ui/UpdatesRailContent";
import { AppearanceRail } from "./AppearanceRail";
import { GeneralRail } from "./GeneralRail";
import { PerformanceRail } from "./PerformanceRail";
import { ShortcutsRail } from "./ShortcutsRail";

const Account = lazy(() =>
  import("./Account").then((module) => ({ default: module.Account })),
);
const General = lazy(() =>
  import("./General").then((module) => ({ default: module.General })),
);
const Appearance = lazy(() =>
  import("./Appearance").then((module) => ({ default: module.Appearance })),
);
const Performance = lazy(() =>
  import("./Performance").then((module) => ({ default: module.Performance })),
);
const Shortcuts = lazy(() =>
  import("./Shortcuts").then((module) => ({ default: module.Shortcuts })),
);
const Updates = lazy(() =>
  import("./Updates").then((module) => ({ default: module.Updates })),
);
const Privacy = lazy(() =>
  import("./Privacy").then((module) => ({ default: module.Privacy })),
);
const Diagnostics = lazy(() =>
  import("./Diagnostics").then((module) => ({ default: module.Diagnostics })),
);
export function Settings() {
  const state = useSettings();
  const pilot = usePilot();
  const [tab, setTab] = useState("general");
  const [search, setSearch] = useState("");

  const loading = <Skeleton label={t("settings.loading")} />;
  const items = [
    {
      value: "account",
      label: t("settings.account"),
      content: (
        <Suspense fallback={loading}>
          <Account />
        </Suspense>
      ),
    },
    {
      value: "general",
      label: t("settings.general"),
      content: (
        <Suspense fallback={loading}>
          <ContentStack>
            <General />
          </ContentStack>
        </Suspense>
      ),
    },
    {
      value: "appearance",
      label: t("settings.appearance"),
      content: (
        <Suspense fallback={loading}>
          <AppearanceGroups>
            <Appearance />
          </AppearanceGroups>
        </Suspense>
      ),
    },
    {
      value: "performance",
      label: t("settings.performance"),
      content: (
        <Suspense fallback={loading}>
          <ContentStack>
            <Performance />
          </ContentStack>
        </Suspense>
      ),
    },
    {
      value: "shortcuts",
      label: t("settings.shortcuts"),
      content: (
        <Suspense fallback={loading}>
          <ShortcutGroups>
            <Shortcuts />
          </ShortcutGroups>
        </Suspense>
      ),
    },
    {
      value: "updates",
      label: t("settings.updates"),
      content: (
        <Suspense fallback={loading}>
          <ContentStack>
            <Updates />
          </ContentStack>
        </Suspense>
      ),
    },
    {
      value: "privacy",
      label: t("settings.privacy"),
      content: (
        <Suspense fallback={loading}>
          <ContentStack>
            <Privacy />
          </ContentStack>
        </Suspense>
      ),
    },
    {
      value: "diagnostics",
      label: t("settings.diagnostics"),
      content: (
        <Suspense fallback={loading}>
          <ContentStack>
            <Diagnostics />
          </ContentStack>
        </Suspense>
      ),
    },
  ];
  const prefixes: Record<string, string[]> = {
    account: ["pilot."],
    general: ["general.", "track.hide"],
    appearance: ["appearance."],
    performance: ["track."],
    shortcuts: ["shortcuts."],
    updates: ["updates."],
    privacy: ["privacy."],
    diagnostics: ["diagnostics."],
  };
  const normalize = (value: string) =>
    value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
  const needle = normalize(search.trim());
  const visible = items.filter((item) =>
    normalize(
      [
        item.label,
        ...Object.entries(settingsText)
          .filter(([key]) =>
            prefixes[item.value]?.some((prefix) => key.startsWith(prefix)),
          )
          .map(([, value]) => value),
      ].join(" "),
    ).includes(needle),
  );
  const selected = visible.some((item) => item.value === tab)
    ? tab
    : (visible[0]?.value ?? "");
  const failure = state.error?.detail.kind;
  return (
    <ContentStack>
      <SectionChrome
        title={t("settings.title")}
        tabs={items.map((item) => ({
          id: item.value,
          etiqueta: item.label,
          visible: visible.includes(item),
        }))}
        activeTab={selected}
        onTabChange={setTab}
        rail={
          selected === "general" ? (
            <GeneralRail onUpdates={() => setTab("updates")} />
          ) : selected === "appearance" ? (
            <AppearanceRail />
          ) : selected === "performance" ? (
            <PerformanceRail />
          ) : selected === "updates" ? (
            <UpdatesRailContent />
          ) : selected === "shortcuts" ? (
            <ShortcutsRail />
          ) : undefined
        }
      />
      <SectionPageHeader
        title={
          (
            items.find((item) => item.value === selected) ??
            items.find((item) => item.value === tab) ??
            items[1]
          ).label
        }
        description={settingsDescriptions[selected || tab]}
        search={
          <SearchInput
            label={t("settings.search")}
            clearLabel={t("settings.clearSearch")}
            value={search}
            onChange={setSearch}
          />
        }
      />
      <StatusAnnouncement>{`${t("settings.results")}: ${visible.length}`}</StatusAnnouncement>
      {pilot.dirty && selected !== "account" && (
        <Callout
          title={t("pilot.unsaved")}
          actions={
            <Button
              onClick={() => {
                setSearch("");
                setTab("account");
              }}
            >
              {t("settings.account")}
            </Button>
          }
        />
      )}
      {failure && (
        <Callout
          tone="err"
          title={t(
            failure === "conflict"
              ? "settings.conflict"
              : failure === "protected"
                ? "settings.protected"
                : "settings.failed",
          )}
          actions={
            <ActionGroup>
              <Button onClick={state.retry} busy={state.pending}>
                {t("settings.retry")}
              </Button>
              <Button
                variant="ghost"
                onClick={state.discard}
                disabled={state.pending}
              >
                {t("settings.discard")}
              </Button>
            </ActionGroup>
          }
        >
          {t(
            failure === "conflict"
              ? "settings.conflictHelp"
              : failure === "protected"
                ? "settings.protectedHelp"
                : "settings.failedHelp",
          )}
        </Callout>
      )}
      {state.view?.protected && (
        <Callout tone="warn" title={t("settings.protected")}>
          {t("settings.protectedHelp")}
        </Callout>
      )}
      {state.view?.warning && (
        <Callout tone="warn" title={t("settings.warning")}>
          {t("settings.warningHelp")}
        </Callout>
      )}
      {state.loading ? (
        loading
      ) : !state.view ? (
        <Callout
          tone="err"
          title={t("settings.unavailable")}
          actions={
            <Button onClick={state.reload}>{t("settings.reload")}</Button>
          }
        />
      ) : visible.length ? (
        <SectionPanel activeTab={selected}>
          {visible.find((item) => item.value === selected)?.content}
        </SectionPanel>
      ) : (
        <Callout title={t("settings.noResults")} />
      )}
    </ContentStack>
  );
}
