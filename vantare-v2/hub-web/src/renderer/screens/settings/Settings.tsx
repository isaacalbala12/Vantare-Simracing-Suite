import { lazy, Suspense, useState } from "react";
import { useSettings } from "../../app/SettingsState";
import { t } from "../../i18n/es";
import { Button } from "../../ui/Button";
import { Callout, Skeleton } from "../../ui/Data";
import { Tabs } from "../../ui/Forms";
import { PageHeader } from "../../ui/Frame";
import { ActionGroup, ContentStack } from "../../ui/ShellLayout";

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
export function Settings() {
  const state = useSettings();
  const [tab, setTab] = useState("general");
  const loading = <Skeleton label={t("settings.loading")} />;
  const failure = state.error?.detail.kind;
  return (
    <ContentStack>
      <PageHeader
        title={t("settings.title")}
        description={t(state.pending ? "settings.saving" : "shell.autoSave")}
      />
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
      ) : (
        <Tabs
          label={t("settings.title")}
          value={tab}
          onChange={setTab}
          items={[
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
                  <ContentStack>
                    <Appearance />
                  </ContentStack>
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
                  <ContentStack>
                    <Shortcuts />
                  </ContentStack>
                </Suspense>
              ),
            },
          ]}
        />
      )}
    </ContentStack>
  );
}
