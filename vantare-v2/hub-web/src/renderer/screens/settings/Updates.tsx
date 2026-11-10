import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useHost } from "../../app/Host";
import { t } from "../../i18n/es";
import { Button } from "../../ui/Button";
import { Callout, Card, Pill, SettingRow, Skeleton } from "../../ui/Data";
export function Updates() {
  const { client } = useHost();
  const cache = useQueryClient();
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
    <>
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
      <Card
        title={t("updates.installed")}
        actions={
          <Button onClick={() => void query.refetch()}>
            {t("settings.reload")}
          </Button>
        }
      >
        {view.installation === "development" && (
          <Pill>{t("updates.development")}</Pill>
        )}
        <SettingRow label={t("updates.version")}>
          <Pill>{view.version}</Pill>
        </SettingRow>
        <SettingRow label={t("updates.channel")}>
          <Pill>{view.channel}</Pill>
        </SettingRow>
        {view.previous && <Callout title={t("updates.previous")} />}
      </Card>
      {view.beta && (
        <Card title={t("updates.beta")}>
          <Callout
            title={
              view.restartAvailable ? t("updates.ready") : view.beta.message
            }
            actions={
              view.restartAvailable ? (
                <Button
                  variant="primary"
                  busy={restart.isPending}
                  onClick={() => restart.mutate()}
                >
                  {t("updates.restart")}
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
      <Card title={t("updates.channels")}>
        <Callout
          title={
            view.channel === "beta"
              ? t("updates.betaHelp")
              : t("updates.channelsHelp")
          }
        />
      </Card>
      <Card title={t("updates.notes")}>
        {view.news.length ? (
          view.news.map((note) => (
            <SettingRow
              key={note.tag + note.title}
              label={note.title}
              description={note.summary}
            >
              <Pill>{note.kind}</Pill>
              <Pill>{note.tag}</Pill>
            </SettingRow>
          ))
        ) : (
          <Callout title={t("updates.noNotes")} />
        )}
      </Card>
    </>
  );
}
