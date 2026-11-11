import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  PrivacyPatch,
  PrivacyView,
} from "../../../contract/generated/contract";
import { coreKey, offline, useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { t } from "../../i18n/es";
import { privacyText as text } from "../../i18n/privacy.es";
import { Button } from "../../ui/Button";
import { Callout, SettingGroup, SettingRow, Skeleton } from "../../ui/Data";
import { Switch } from "../../ui/Forms";
import {
  MailConsent,
  PrivacyDetails,
  PrivacyLayout,
} from "../../ui/PrivacyPresentation";
import { ActionGroup } from "../../ui/ShellLayout";

const key = ["privacy"] as const;
export function Privacy() {
  const { client } = useHost();
  const cache = useQueryClient();
  const [mailIntent, setMailIntent] = useState<boolean>();
  const [mailRequested, setMailRequested] = useState(false);
  const mailBusy = useRef(false);
  const [failure, setFailure] = useState<HostFailure>();
  const failed = useRef<PrivacyPatch | undefined>(undefined);
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const busy = useRef(false);
  const core =
    useQuery({
      queryKey: coreKey,
      queryFn: async () => offline,
      enabled: false,
    }).data ?? offline;
  const query = useQuery({
    queryKey: key,
    enabled: !!client,
    retry: false,
    queryFn: async () => {
      const reply = await client?.request({ method: "privacy.get" });
      if (reply?.method !== "privacy.get")
        throw new Error("privacy unavailable");
      return reply.value;
    },
  });
  const save = useMutation({
    mutationFn: async (patch: PrivacyPatch) => {
      if (!query.data) throw new HostFailure({ kind: "coreUnavailable" });
      const reply = await client?.request({
        method: "privacy.update",
        patch,
        baseRevision: query.data.revision,
      });
      if (reply?.method !== "privacy.update")
        throw new HostFailure({ kind: "io" });
      return reply.value;
    },
    onSuccess: (value: PrivacyView) => {
      cache.setQueryData(key, value);
      failed.current = undefined;
      setFailure(undefined);
    },
    onError: (error: Error) => {
      const failure =
        error instanceof HostFailure ? error : new HostFailure({ kind: "io" });
      if (failure.detail.kind === "privacyConflict")
        cache.setQueryData(key, failure.detail.current);
      if (failure.detail.kind === "privacyCleanup") {
        cache.setQueryData(key, failure.detail.current);
        failed.current = undefined;
        setFailure(undefined);
        return;
      }
      setFailure(failure);
    },
  });
  useEffect(() => {
    if (!client) return;
    return client.addCloseGuard(async (reason) => {
      await inFlight.current;
      if (reason === "live") {
        failed.current = undefined;
        setFailure(undefined);
        return true;
      }
      return failed.current === undefined;
    });
  }, [client]);
  function run(patch: PrivacyPatch) {
    if (busy.current) return;
    busy.current = true;
    failed.current = patch;
    inFlight.current = save
      .mutateAsync(patch)
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        busy.current = false;
      });
  }
  const mail = useQuery({
    queryKey: ["mail", core.services],
    enabled: !!client && core.services === "connected",
    retry: false,
    queryFn: async () => {
      const reply = await client?.request({ method: "mail.get" });
      if (reply?.method !== "mail.get") throw new Error("mail unavailable");
      return reply.value;
    },
  });
  const changeMail = useMutation({
    mutationFn: async (consent: boolean) => {
      const reply = await client?.request({
        method: "mail.set",
        consent,
        source: "settings",
      });
      if (reply?.method !== "mail.set") throw new HostFailure({ kind: "io" });
      return reply.value;
    },
    onSuccess: (value) => {
      cache.setQueryData(["mail", core.services], value);
      setMailIntent(undefined);
    },
  });
  const policy = useMutation({
    mutationFn: async () => {
      const reply = await client?.request({ method: "privacy.policy" });
      if (reply?.method !== "privacy.policy" || !reply.accepted)
        throw new Error("policy unavailable");
    },
  });
  function runMail(value: boolean) {
    if (mailBusy.current || mail.isFetching) return;
    mailBusy.current = true;
    setMailIntent(value);
    void changeMail
      .mutateAsync(value)
      .catch(() => {})
      .finally(() => {
        mailBusy.current = false;
      });
  }
  function refreshMail() {
    if (mailBusy.current || mail.isFetching) return;
    mailBusy.current = true;
    setMailRequested(true);
    void mail.refetch().finally(() => {
      mailBusy.current = false;
    });
  }
  if (query.isPending) return <Skeleton label={t("settings.loading")} />;
  if (!query.data)
    return (
      <Callout
        tone="err"
        title={t("privacy.failed")}
        actions={
          <Button onClick={() => void query.refetch()}>
            {t("settings.reload")}
          </Button>
        }
      />
    );
  const view = query.data;
  const blocked =
    view.protected || (view.cleanupPending && !view.cleanupBusy) || !!failure;
  return (
    <PrivacyLayout>
      {view.protected && (
        <Callout tone="warn" title={t("settings.protected")}>
          {t("settings.protectedHelp")}
        </Callout>
      )}
      {view.cleanupPending && (
        <Callout
          tone="warn"
          title={t(
            view.cleanupBusy ? "privacy.cleanupBusy" : "privacy.cleanup",
          )}
          actions={
            <Button onClick={() => void query.refetch()}>
              {t("settings.reload")}
            </Button>
          }
        />
      )}
      {failure && (
        <Callout
          tone="err"
          title={t(
            failure.detail.kind === "privacyConflict"
              ? "privacy.conflict"
              : "privacy.failed",
          )}
          actions={
            <ActionGroup>
              <Button
                busy={save.isPending}
                onClick={() => {
                  if (failed.current) run(failed.current);
                }}
              >
                {t("settings.retry")}
              </Button>
              <Button
                onClick={() => {
                  failed.current = undefined;
                  setFailure(undefined);
                  void query.refetch();
                }}
              >
                {t("settings.discard")}
              </Button>
            </ActionGroup>
          }
        >
          {t("privacy.conflictHelp")}
        </Callout>
      )}
      <SettingGroup number={1} title={text.shared}>
        <SettingRow
          label={t("privacy.crashes")}
          description={t("privacy.crashesHelp")}
        >
          <Switch
            hideLabel
            label={t("privacy.crashes")}
            checked={view.crashes}
            disabled={blocked}
            pending={save.isPending}
            onCheckedChange={(value) => run({ field: "crashes", value })}
          />
        </SettingRow>
        <SettingRow
          label={t("privacy.usage")}
          description={t("privacy.usageHelp")}
        >
          <Switch
            hideLabel
            label={t("privacy.usage")}
            checked={view.usage}
            disabled={blocked}
            pending={save.isPending}
            onCheckedChange={(value) => run({ field: "usage", value })}
          />
        </SettingRow>
        <PrivacyDetails
          configured={view.reportingConfigured}
          pending={policy.isPending}
          onPolicy={() => policy.mutate()}
        />
      </SettingGroup>
      {policy.isError && (
        <Callout tone="err" title={t("privacy.policyFailed")} />
      )}
      <MailConsent
        message={
          changeMail.isPending
            ? text.saving
            : mail.data
              ? text.optional
              : core.services === "connected"
                ? text.signIn
                : t("privacy.mailUnavailable")
        }
        consent={mail.data?.consent ?? false}
        intent={mailIntent}
        pending={changeMail.isPending || mail.isFetching}
        available={core.services === "connected"}
        onChange={runMail}
        onRefresh={refreshMail}
      />
      {(changeMail.isError || (mailRequested && mail.isError)) && (
        <Callout tone="err" title={t("privacy.mailFailed")} />
      )}
    </PrivacyLayout>
  );
}
