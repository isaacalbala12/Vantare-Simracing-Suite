import { useState } from "react";
import {
  diagnosticCodes,
  diagnosticSections,
} from "../../../contract/generated/contract";
import { useDiagnostics } from "../../app/DiagnosticsState";
import { t } from "../../i18n/es";
import { Button } from "../../ui/Button";
import { Callout, Card, Skeleton, Table } from "../../ui/Data";
import { Select, Textarea } from "../../ui/Forms";
import { ActionGroup, CardGrid } from "../../ui/ShellLayout";

export function Diagnostics() {
  const [section, setSection] = useState("all");
  const [code, setCode] = useState("all");
  const { query, prepare, copy } = useDiagnostics();
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
          <p>{`${t("shell.version")}: ${view.version}`}</p>
          <p>{`${t("diagnostics.system")}: ${view.os} ${view.arch}`}</p>
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
