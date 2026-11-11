import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useDiagnostics } from "../../app/DiagnosticsState";
import { coreKey, offline, useHost } from "../../app/Host";
import { useSettings } from "../../app/SettingsState";
import { diagnosticsText as text } from "../../i18n/diagnostics.es";
import { t } from "../../i18n/es";
import { Button } from "../../ui/Button";
import { Callout, SettingGroup, SettingRow, Skeleton } from "../../ui/Data";
import {
  DiagnosticHealth,
  DiagnosticLog,
  DiagnosticsLayout,
} from "../../ui/DiagnosticsPresentation";
import { StatusAnnouncement } from "../../ui/Frame";
import { launcherKey } from "../launcher/state";
export function Diagnostics() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const cache = useQueryClient();
  const { client } = useHost();
  const settings = useSettings();
  const { query, prepare, copy } = useDiagnostics({
    notifyCopied: false,
    notifyErrors: false,
  });
  const core = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  }).data;
  const privacy = useQuery({
    queryKey: ["privacy"],
    enabled: !!client,
    retry: false,
    queryFn: async () => {
      const reply = await client?.request({ method: "privacy.get" });
      if (reply?.method !== "privacy.get")
        throw new Error("privacy unavailable");
      return reply.value;
    },
  });
  const launcher = useQuery({
    queryKey: launcherKey,
    enabled: !!client,
    retry: false,
    queryFn: async () => {
      const reply = await client?.request({ method: "launcher.get" });
      if (reply?.method !== "launcher.get")
        throw new Error("launcher unavailable");
      return reply.value;
    },
  });
  useEffect(() => {
    if (!client) return;
    const off = client.listen((message) => {
      if (message.kind === "event" && message.event.topic === "launcher")
        cache.setQueryData(launcherKey, message.event.value);
    });
    const unsubscribe = client.subscribe("launcher");
    return () => {
      off();
      unsubscribe();
    };
  }, [client, cache]);
  if (query.isPending) return <Skeleton label={t("settings.loading")} />;
  if (!query.data)
    return (
      <Callout
        tone="err"
        title={t("diagnostics.failed")}
        actions={
          <Button onClick={() => void query.refetch()}>
            {t("settings.reload")}
          </Button>
        }
      />
    );
  const view = query.data;
  return (
    <DiagnosticsLayout>
      <DiagnosticHealth
        live={(core ?? view.core).live}
        launching={launcher.data?.running}
        preferences={
          settings.view
            ? !(
                settings.view.protected ||
                settings.view.warning ||
                settings.error
              )
            : undefined
        }
        configured={privacy.data?.reportingConfigured}
        prepared={Boolean(view.report)}
      />
      <SettingGroup number={2} title={text.local}>
        <SettingRow label={text.sanitized} description={text.safe}>
          <Button
            variant="primary"
            aria-busy={prepare.isPending || undefined}
            aria-disabled={prepare.isPending || undefined}
            onClick={() => {
              if (!prepare.isPending) prepare.mutate();
            }}
          >
            {prepare.isPending ? text.preparing : t("diagnostics.prepare")}
          </Button>
        </SettingRow>
        {view.report && (
          <SettingRow label={text.reportPrepared} description={text.localCopy}>
            <Button
              size="sm"
              busy={copy.isPending}
              onClick={() => copy.mutate()}
            >
              {t("diagnostics.copy")}
            </Button>
          </SettingRow>
        )}
      </SettingGroup>
      {(prepare.isError || copy.isError) && (
        <Callout tone="err" title={t("diagnostics.failed")} />
      )}
      {copy.isSuccess && (
        <StatusAnnouncement>{t("diagnostics.copied")}</StatusAnnouncement>
      )}
      <DiagnosticLog
        events={view.events}
        query={search}
        onQuery={setSearch}
        filter={filter}
        onFilter={setFilter}
        onClear={() => {
          setFilter("all");
          setSearch("");
        }}
      />
    </DiagnosticsLayout>
  );
}
