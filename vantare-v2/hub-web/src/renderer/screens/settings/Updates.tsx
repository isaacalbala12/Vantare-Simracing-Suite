import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useHost } from "../../app/Host";
import { t } from "../../i18n/es";
import { Button } from "../../ui/Button";
import { Callout, Card, Pill, SettingRow, Skeleton } from "../../ui/Data";
import { StatusAnnouncement } from "../../ui/Frame";
import {
  ReleaseNews,
  UpdateChannels,
  UpdateHero,
  UpdatesLayout,
} from "../../ui/UpdatesPresentation";

export function Updates() {
  const { client } = useHost();
  const cache = useQueryClient();
  const [restartVeto, setRestartVeto] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const vetoed = useRef(false);
  useEffect(
    () =>
      client?.onCloseVeto((reason) => {
        if (reason !== "restart") return;
        vetoed.current = true;
        setRestarting(false);
        setRestartVeto(true);
      }),
    [client],
  );
  useEffect(() => {
    if (!client) return;
    const unlisten = client.listen((message) => {
      if (message.kind === "event" && message.event.topic === "updates")
        cache.setQueryData(["updates"], message.event.value);
    });
    const unsubscribe = client.subscribe("updates");
    return () => {
      unsubscribe();
      unlisten();
    };
  }, [client, cache]);
  const query = useQuery({
    queryKey: ["updates"],
    enabled: !!client,
    queryFn: async () => {
      const reply = await client?.request({ method: "updates.get" });
      if (reply?.method !== "updates.get")
        throw new Error("Updates unavailable");
      return reply.value;
    },
  });
  const restart = useMutation({
    onMutate: () => {
      vetoed.current = false;
      setRestartVeto(false);
    },
    onSuccess: () => {
      if (!vetoed.current) setRestarting(true);
    },
    mutationFn: async () => {
      const reply = await client?.request({ method: "updates.restart" });
      if (reply?.method !== "updates.restart" || !reply.accepted)
        throw new Error("Restart unavailable");
    },
  });
  if (query.isPending) return <Skeleton label={t("updates.checking")} />;
  if (query.isError || !query.data)
    return (
      <Callout
        tone="warn"
        title={t("updates.invalid")}
        actions={
          <Button onClick={() => void query.refetch()}>
            {t("settings.reload")}
          </Button>
        }
      >
        {t("updates.invalidHelp")}
      </Callout>
    );
  const view = query.data;
  return (
    <UpdatesLayout>
      {restartVeto && <Callout tone="warn" title={t("updates.restartVeto")} />}
      {view.installation === "invalid" && (
        <Callout tone="warn" title={t("updates.invalid")}>
          {t("updates.invalidHelp")}
        </Callout>
      )}
      {restart.isError && (
        <Callout tone="err" title={t("updates.failed")}>
          {t("updates.failedHelp")}
        </Callout>
      )}
      {view.registrationWarning && (
        <Callout tone="warn" title={t("updates.registration")}>
          {view.registrationWarning}
        </Callout>
      )}
      {view.installation === "development" && (
        <StatusAnnouncement>{t("updates.development")}</StatusAnnouncement>
      )}
      <UpdateHero view={view} />
      {view.beta && view.beta.state !== "current" && (
        <Card title={t("updates.beta")}>
          <Callout
            title={
              view.restartAvailable ? t("updates.ready") : view.beta.message
            }
            actions={
              view.restartAvailable ? (
                <Button
                  variant="primary"
                  busy={restart.isPending || restarting}
                  onClick={() => restart.mutate()}
                >
                  {t(restarting ? "updates.restarting" : "updates.restart")}
                </Button>
              ) : undefined
            }
          >
            {view.restartAvailable ? t("updates.restartHelp") : view.beta.notes}
          </Callout>
          <SettingRow label={t("updates.version")}>
            <Pill>{view.beta.version}</Pill>
          </SettingRow>
        </Card>
      )}
      <UpdateChannels view={view} />
      <ReleaseNews view={view} />
    </UpdatesLayout>
  );
}
