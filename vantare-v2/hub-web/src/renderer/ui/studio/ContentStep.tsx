import { Tabs } from "@base-ui/react/tabs";
import { type ReactNode, useEffect, useId, useState } from "react";
import type {
  OverlayInstance,
  WidgetSettings,
  WidgetSettingsPatch,
} from "../../../contract/generated/studio";
import { studioWidgetOptions } from "../../../contract/generated/studio";
import { studioText as studio } from "../../i18n/studio";
import { studioContentText as text } from "../../i18n/studio-content.es";
import { useAppearance } from "../../screens/studio/appearance";
import {
  type ColumnSession,
  canEditColumns,
  canResetColumns,
  contentColumns,
  editColumn,
  requiredColumn,
  resetColumns,
  type TableSettings,
} from "../../screens/studio/content-columns";
import { Button } from "../Button";
import { Input, Select, Switch } from "../Forms";
import "./studio-content.css";

type Model = ReturnType<typeof useAppearance>;
export function ContentStep({ item }: { item: OverlayInstance }) {
  const model = useAppearance(item);
  const settings = item.settings;
  if (!model.readable || !settings)
    return <p>{studio.appearanceUnavailable}</p>;
  if (settings.kind === "standings" || settings.kind === "relative")
    return <TableContent key={item.id} settings={settings} model={model} />;
  const toggle = (
    label: string,
    checked: boolean,
    value: WidgetSettingsPatch,
  ) => (
    <Switch
      label={label}
      checked={checked}
      disabled={model.disabled}
      pending={model.pending}
      onCheckedChange={() => void model.patch(value, label)}
    />
  );
  return (
    <div className="v-studio-content">
      {settings.kind === "delta" && settings.designSystem === "vantare" ? (
        <Group title={studio.content}>
          <Select
            label={text.reference}
            value={settings.reference}
            disabled={model.disabled}
            pending={model.pending}
            options={studioWidgetOptions.delta.references.map((value) => ({
              value,
              label: text.references[value],
            }))}
            onChange={(value) => {
              const reference = studioWidgetOptions.delta.references.find(
                (id) => id === value,
              );
              if (reference)
                void model.patch({ kind: "delta", reference }, text.reference);
            }}
          />
          <p>{text.referenceHelp}</p>
          {settings.size === "expanded" && (
            <Switch
              label={text.sectors}
              checked={settings.showSectors}
              disabled={model.disabled}
              pending={model.pending}
              onCheckedChange={(showSectors) =>
                void model.patch({ kind: "delta", showSectors }, text.sectors)
              }
            />
          )}
        </Group>
      ) : settings.kind === "pedals" && settings.designSystem === "vantare" ? (
        <Group title={studio.content}>
          {toggle(text.brakePeak, settings.showBrakePeak, {
            kind: "pedals",
            showBrakePeak: !settings.showBrakePeak,
          })}
        </Group>
      ) : settings.kind === "fuel-strategy" &&
        settings.designSystem === "eficiencia" ? (
        <Group title={studio.content}>
          {toggle(text.projection, settings.showProjection, {
            kind: "fuel-strategy",
            showProjection: !settings.showProjection,
          })}
        </Group>
      ) : (
        <Group title={text.empty}>
          <p>{text.emptyHelp}</p>
        </Group>
      )}
    </div>
  );
}
const sessionNames: Record<ColumnSession, string> = {
  practice: studio.practiceShort,
  qualifying: studio.qualifyingShort,
  race: studio.raceShort,
};
function TableContent({
  settings,
  model,
}: {
  settings: TableSettings;
  model: Model;
}) {
  return (
    <div className="v-studio-content">
      {settings.kind === "standings" ? (
        <Tabs.Root className="v-studio-content-table" defaultValue="race">
          <h3>{text.sessions}</h3>
          <Tabs.List
            className="v-studio-content-sessions"
            aria-label={text.sessions}
            activateOnFocus
          >
            {(Object.keys(sessionNames) as ColumnSession[]).map((session) => (
              <Tabs.Tab key={session} value={session}>
                {sessionNames[session]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {(Object.keys(sessionNames) as ColumnSession[]).map((session) => (
            <Tabs.Panel key={session} value={session}>
              <ColumnSettings
                settings={settings}
                model={model}
                session={session}
              />
            </Tabs.Panel>
          ))}
        </Tabs.Root>
      ) : (
        <ColumnSettings settings={settings} model={model} session="race" />
      )}
      {settings.kind === "standings" && (
        <StandingsContent settings={settings} model={model} />
      )}
    </div>
  );
}
function ColumnSettings({
  settings,
  session,
  model,
}: {
  settings: TableSettings;
  session: ColumnSession;
  model: Model;
}) {
  const columns = contentColumns(settings, session);
  const editable = canEditColumns(settings, session);
  const [selection, setSelection] = useState("driverName");
  const column =
    columns?.find((item) => item.metricId === selection) ?? columns?.[0];
  const resetHelp = useId();
  const timeHelp = useId();
  const save = (value: WidgetSettingsPatch | null, control: string) => {
    if (value) void model.patch(value, control);
  };
  const edit = (value: Parameters<typeof editColumn>[3]) => {
    if (column)
      save(
        editColumn(settings, session, column.metricId, value),
        text.columnFormat,
      );
  };
  return (
    <div className="v-studio-content-table-grid">
      <Group title={text.columns}>
        {settings.kind === "standings" && (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={model.disabled || !canResetColumns(settings, session)}
              aria-disabled={model.pending || undefined}
              aria-describedby={
                !canResetColumns(settings, session) ? resetHelp : undefined
              }
              onClick={() => {
                if (!model.pending)
                  save(resetColumns(settings, session), text.reset);
              }}
            >
              {text.reset}
            </Button>
            {!canResetColumns(settings, session) && (
              <p id={resetHelp}>{text.resetBlocked}</p>
            )}
          </>
        )}
        {!columns?.length && (
          <p>{columns ? text.noColumns : text.unreadable}</p>
        )}
        {!!columns?.length && !editable && <p>{text.unreadable}</p>}
        <div className="v-studio-content-columns">
          {columns?.map((entry) => (
            <div key={entry.id} className="v-studio-content-column">
              <Switch
                label={text.labels[entry.metricId] ?? entry.metricId}
                checked={
                  entry.enabled || requiredColumn(settings, entry.metricId)
                }
                disabled={
                  model.disabled ||
                  !editable ||
                  requiredColumn(settings, entry.metricId)
                }
                pending={model.pending}
                onCheckedChange={(enabled) =>
                  save(
                    editColumn(settings, session, entry.metricId, { enabled }),
                    text.columns,
                  )
                }
              />
              {requiredColumn(settings, entry.metricId) && (
                <small>{text.required}</small>
              )}
            </div>
          ))}
        </div>
      </Group>
      {settings.kind === "standings" && column && (
        <Group title={text.columnFormat}>
          <Select
            label={text.columnFormat}
            value={column.metricId}
            options={(columns ?? []).map((entry) => ({
              value: entry.metricId,
              label: text.labels[entry.metricId] ?? entry.metricId,
            }))}
            onChange={setSelection}
          />
          {column.metricId === "driverName" && (
            <>
              <Select
                label={text.name}
                value={column.format.mode || "full"}
                disabled={model.disabled || !editable}
                pending={model.pending}
                options={studioWidgetOptions.columns.names.map((value) => ({
                  value,
                  label: text.names[value],
                }))}
                onChange={(value) => {
                  const mode = studioWidgetOptions.columns.names.find(
                    (id) => id === value,
                  );
                  if (mode) edit({ format: { mode } });
                }}
              />
              {column.format.mode === "truncate" && (
                <ContentNumber
                  key={column.id}
                  label={text.maxChars}
                  value={column.format.maxChars ?? 16}
                  min={1}
                  max={studioWidgetOptions.columns.maxChars}
                  model={{ ...model, disabled: model.disabled || !editable }}
                  onCommit={(maxChars) => edit({ format: { maxChars } })}
                />
              )}
              <Select
                label={text.width}
                value={column.widthPreset}
                disabled={model.disabled || !editable}
                pending={model.pending}
                options={studioWidgetOptions.columns.widths.map((value) => ({
                  value,
                  label: text.widths[value],
                }))}
                onChange={(value) => {
                  const widthPreset = studioWidgetOptions.columns.widths.find(
                    (id) => id === value,
                  );
                  if (widthPreset) edit({ widthPreset });
                }}
              />
            </>
          )}
          {["lastLap", "bestLap"].includes(column.metricId) && (
            <>
              <Select
                label={text.timeFormat}
                value={column.format.display ?? "normal"}
                disabled
                aria-describedby={timeHelp}
                options={Object.entries(text.timeNames).map(
                  ([value, label]) => ({ value, label }),
                )}
                onChange={() => {}}
              />
              <Input
                label={text.decimals}
                value={String(column.format.decimals ?? 3)}
                disabled
                aria-describedby={timeHelp}
              />
              <p id={timeHelp}>{text.timeReadOnly}</p>
            </>
          )}
        </Group>
      )}
    </div>
  );
}
function StandingsContent({
  settings,
  model,
}: {
  settings: Extract<WidgetSettings, { kind: "standings" }>;
  model: Model;
}) {
  const footers = {
    none: text.none,
    track: text.track,
    estimatedLaps: text.estimatedLaps,
  };
  return (
    <Group title={text.classification}>
      <Select
        label={text.classification}
        value={settings.classificationMode}
        disabled={model.disabled}
        pending={model.pending}
        options={studioWidgetOptions.standings.classifications.map((value) => ({
          value,
          label: value === "normal" ? text.normal : text.multiclass,
        }))}
        onChange={(value) => {
          const classificationMode =
            studioWidgetOptions.standings.classifications.find(
              (id) => id === value,
            );
          if (classificationMode)
            void model.patch(
              { kind: "standings", classificationMode },
              text.classification,
            );
        }}
      />
      {settings.designSystem === "eficiencia" && (
        <>
          <Switch
            label={text.header}
            checked={settings.showSessionHeader}
            disabled={model.disabled}
            pending={model.pending}
            onCheckedChange={(showSessionHeader) =>
              void model.patch(
                { kind: "standings", showSessionHeader },
                text.header,
              )
            }
          />
          <Switch
            label={text.footer}
            checked={settings.showSessionFooter}
            disabled={model.disabled}
            pending={model.pending}
            onCheckedChange={(showSessionFooter) =>
              void model.patch(
                { kind: "standings", showSessionFooter },
                text.footer,
              )
            }
          />
          {(["footerFirst", "footerSecond"] as const).map((field) => (
            <Select
              key={field}
              label={
                field === "footerFirst" ? text.firstFooter : text.secondFooter
              }
              value={settings[field]}
              disabled={model.disabled}
              pending={model.pending}
              options={studioWidgetOptions.standings.footerMetrics.map(
                (value) => ({ value, label: footers[value] }),
              )}
              onChange={(value) => {
                const metric = studioWidgetOptions.standings.footerMetrics.find(
                  (id) => id === value,
                );
                if (metric)
                  void model.patch(
                    { kind: "standings", [field]: metric },
                    field,
                  );
              }}
            />
          ))}
        </>
      )}
    </Group>
  );
}
function ContentNumber({
  label,
  value,
  min,
  max,
  model,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  model: Model;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);
  useEffect(() => {
    setDraft(String(value));
    setError(false);
  }, [value]);
  function commit() {
    if (model.disabled || model.pending) return;
    const number = Number(draft);
    if (
      !draft.trim() ||
      !Number.isInteger(number) ||
      number < min ||
      number > max
    ) {
      setError(true);
      return;
    }
    if (number !== value) onCommit(number);
    setDraft(String(value));
  }
  return (
    <Input
      label={label}
      value={draft}
      inputMode="numeric"
      disabled={model.disabled}
      readOnly={model.pending}
      error={error ? text.invalidNumber(min, max) : undefined}
      onChange={(event) => {
        setDraft(event.target.value);
        setError(false);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="v-studio-appearance-group" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
