import type { ReactNode } from "react";
import type { DiagnosticEntry } from "../../contract/generated/contract";
import { Icon, type IconName } from "../assets/icons/Icon";
import { diagnosticsText as text } from "../i18n/diagnostics.es";
import { t } from "../i18n/es";
import { Button } from "./Button";
import { Table } from "./Data";
import { Segmented } from "./Forms";
import { TrackedCaps } from "./TrackedCaps";
import "./diagnostics.css";
export function DiagnosticsLayout({ children }: { children: ReactNode }) {
  return <div className="v-diagnostics">{children}</div>;
}
export function DiagnosticHealth({
  live,
  launching,
  preferences,
  configured,
  prepared,
}: {
  live: boolean;
  launching: boolean | undefined;
  preferences: boolean | undefined;
  configured: boolean | undefined;
  prepared: boolean;
}) {
  const items: { label: string; state: string; icon: IconName }[] = [
    { label: text.hub, state: text.executing, icon: "v-home" },
    {
      label: text.telemetry,
      state: live ? text.connected : text.waiting,
      icon: "pulse",
    },
    {
      label: text.launcher,
      state:
        launching === undefined
          ? text.unavailable
          : launching
            ? text.launching
            : text.idle,
      icon: "v-launch",
    },
    {
      label: text.preferences,
      state:
        preferences === undefined
          ? text.unavailable
          : preferences
            ? text.loaded
            : text.localError,
      icon: "v-sliders",
    },
    {
      label: text.delivery,
      state:
        configured === undefined
          ? text.unavailable
          : configured
            ? text.configured
            : text.notConfigured,
      icon: "v-shield",
    },
    {
      label: text.localReport,
      state: prepared ? text.prepared : text.notPrepared,
      icon: "v-testing",
    },
  ];
  return (
    <section className="v-diagnostic-health" aria-label={text.state}>
      <h2>
        <Icon name="pulse" />
        <TrackedCaps>{text.state}</TrackedCaps>
      </h2>
      <div className="v-diagnostic-health-grid">
        {items.map((item) => (
          <div className="v-diagnostic-health-item" key={item.label}>
            <span className="v-diagnostic-health-icon">
              <Icon name={item.icon} />
            </span>
            <div>
              <strong>{item.label}</strong>
              <span>{item.state}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
export function DiagnosticLog({
  events,
  query,
  onQuery,
  filter,
  onFilter,
  onClear,
}: {
  events: DiagnosticEntry[];
  query: string;
  onQuery: (query: string) => void;
  filter: string;
  onFilter: (filter: string) => void;
  onClear: () => void;
}) {
  const needle = query.trim().toLocaleLowerCase("es");
  const rows = events.filter((item) =>
    `${t(`diagnostics.section.${item.section}`)} ${t(`diagnostics.code.${item.code}`)} ${text.error}`
      .toLocaleLowerCase("es")
      .includes(needle),
  );
  return (
    <section
      className="v-diagnostic-log"
      aria-label={t("diagnostics.observed")}
    >
      <h2>
        <Icon name="v-testing" />
        <TrackedCaps>{t("diagnostics.observed")}</TrackedCaps>
      </h2>
      <div className="v-diagnostic-log-body">
        <div className="v-diagnostic-log-filters">
          <Segmented
            label={text.level}
            value={filter}
            onChange={onFilter}
            options={[
              { value: "all", label: t("diagnostics.all") },
              { value: "error", label: text.error },
            ]}
          />
          <input
            className="v-input"
            type="search"
            aria-label={text.search}
            placeholder={text.search}
            value={query}
            onChange={(event) => onQuery(event.currentTarget.value)}
          />
          <Button onClick={onClear}>{text.clear}</Button>
        </div>
        {rows.length ? (
          <Table
            caption={t("diagnostics.observed")}
            empty={t("diagnostics.noMatches")}
            columns={[
              { key: "time", label: text.time },
              { key: "level", label: text.level },
              { key: "module", label: text.module },
              { key: "message", label: text.message },
            ]}
            rows={rows.map((item) => ({
              id: String(item.sequence),
              cells: [
                text.noTime,
                text.error,
                t(`diagnostics.section.${item.section}`),
                t(`diagnostics.code.${item.code}`),
              ],
            }))}
          />
        ) : (
          <p className="v-diagnostic-empty">
            {events.length ? t("diagnostics.noMatches") : text.empty}
          </p>
        )}
      </div>
    </section>
  );
}
