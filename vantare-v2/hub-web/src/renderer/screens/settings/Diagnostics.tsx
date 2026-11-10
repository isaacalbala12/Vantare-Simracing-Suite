import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  diagnosticCodes,
  diagnosticSections,
} from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { t } from "../../i18n/es";
import { Button } from "../../ui/Button";
import { Callout, Card, SettingRow, Skeleton, Table } from "../../ui/Data";
import { Select, Textarea } from "../../ui/Forms";
import { useToastManager } from "../../ui/Layers";
import { ActionGroup, CardGrid } from "../../ui/ShellLayout";

const key = ["diagnostics"] as const;
export function Diagnostics() {
  const { client } = useHost();
  const cache = useQueryClient();
  const toast = useToastManager();
  const [section, setSection] = useState("all");
  const [code, setCode] = useState("all");
  const query = useQuery({
    queryKey: key,
    enabled: !!client,
    retry: false,
    queryFn: async () => {
      const reply = await client?.request({ method: "diagnostics.get" });
      if (reply?.method !== "diagnostics.get")
        throw new Error("diagnostics unavailable");
      return reply.value;
    },
  });
  const prepare = useMutation({
    mutationFn: async () => {
      const reply = await client?.request({ method: "diagnostics.prepare" });
      if (reply?.method !== "diagnostics.prepare")
        throw new Error("report unavailable");
      return reply.value;
    },
    onSuccess: (value) => cache.setQueryData(key, value),
    onError: () => toast.add({ title: t("diagnostics.failed"), type: "err" }),
  });
  const copy = useMutation({
    mutationFn: async () => {
      const reply = await client?.request({ method: "diagnostics.copy" });
      if (reply?.method !== "diagnostics.copy")
        throw new Error("copy unavailable");
    },
    onSuccess: () => toast.add({ title: t("diagnostics.copied") }),
    onError: () => toast.add({ title: t("diagnostics.failed"), type: "err" }),
  });
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
  const rows = view.events.filter(
    (item) =>
      (section === "all" || item.section === section) &&
      (code === "all" || item.code === code),
  );
  return (
    <>
      <CardGrid>
        <Card title={t("diagnostics.hub")}>
          <SettingRow label={t("shell.version")}>{view.version}</SettingRow>
          <SettingRow label={t("diagnostics.system")}>
            {view.os} {view.arch}
          </SettingRow>
        </Card>
        <Card title={t("diagnostics.core")}>
          <Callout title={t(`diagnostics.link.${view.core.photos}`)} />
        </Card>
        <Card title={t("diagnostics.rights")}>
          <Callout title={t(`diagnostics.link.${view.core.rights}`)} />
        </Card>
        <Card title={t("diagnostics.services")}>
          <Callout title={t(`diagnostics.link.${view.core.services}`)} />
        </Card>
        <Card title={t("diagnostics.settings")}>
          <Callout
            title={t(
              view.settingsProtected
                ? "settings.protected"
                : "diagnostics.readable",
            )}
          />
        </Card>
      </CardGrid>
      <Card
        title={t("diagnostics.report")}
        actions={
          <ActionGroup>
            <Button busy={prepare.isPending} onClick={() => prepare.mutate()}>
              {t("diagnostics.prepare")}
            </Button>
            <Button
              busy={copy.isPending}
              disabled={!view.report}
              onClick={() => copy.mutate()}
            >
              {t("diagnostics.copy")}
            </Button>
          </ActionGroup>
        }
      >
        <Callout title={t("diagnostics.safe")} />
        {(prepare.isError || copy.isError) && (
          <Callout tone="err" title={t("diagnostics.failed")} />
        )}
        {view.report && (
          <Textarea
            label={t("diagnostics.preview")}
            readOnly
            value={view.report}
          />
        )}
      </Card>
      <Card
        title={t("diagnostics.observed")}
        actions={
          <Button onClick={() => void query.refetch()}>
            {t("settings.reload")}
          </Button>
        }
      >
        <ActionGroup>
          <Select
            label={t("diagnostics.section")}
            value={section}
            onChange={setSection}
            options={[
              { value: "all", label: t("diagnostics.all") },
              ...diagnosticSections.map((value) => ({
                value,
                label: t(`diagnostics.section.${value}`),
              })),
            ]}
          />
          <Select
            label={t("diagnostics.code")}
            value={code}
            onChange={setCode}
            options={[
              { value: "all", label: t("diagnostics.all") },
              ...diagnosticCodes.map((value) => ({
                value,
                label: t(`diagnostics.code.${value}`),
              })),
            ]}
          />
        </ActionGroup>
        <Table
          caption={t("diagnostics.observed")}
          empty={t(
            view.events.length ? "diagnostics.noMatches" : "diagnostics.empty",
          )}
          columns={[
            { key: "section", label: t("diagnostics.section") },
            { key: "code", label: t("diagnostics.code") },
            { key: "sequence", label: t("diagnostics.sequence") },
          ]}
          rows={rows.map((item) => ({
            id: String(item.sequence),
            cells: [
              t(`diagnostics.section.${item.section}`),
              t(`diagnostics.code.${item.code}`),
              String(item.sequence),
            ],
          }))}
        />
      </Card>
    </>
  );
}
