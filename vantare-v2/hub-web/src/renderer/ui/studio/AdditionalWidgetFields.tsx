import { type ReactNode, useEffect, useRef, useState } from "react";
import type {
  OverlayInstance,
  WidgetSettings,
  WidgetSettingsPatch,
} from "../../../contract/generated/studio";
import { studioAdditionalOptions as options } from "../../../contract/generated/studio";
import { studioWidgetFieldsText as text } from "../../i18n/studio-widget-fields.es";
import { useAppearance } from "../../screens/studio/appearance";
import { Input, Select, Switch } from "../Forms";
import { ContentNumber } from "./ContentControls";

type Model = ReturnType<typeof useAppearance>;
type Tab = "content" | "track";
const kinds = [
  "broadcast-tower",
  "car-damage-numbers",
  "car-damage-visual",
  "delta-trace",
  "fastest-lap",
  "head-to-head",
  "input-telemetry",
  "track-map",
  "multiclass-relative",
  "pedals-telemetry",
  "radar",
  "racing-flags",
  "track-weather",
] as const;
export function hasAdditionalFields(kind: WidgetSettings["kind"]) {
  return kinds.some((value) => value === kind);
}
export function AdditionalBehavior({ item }: { item: OverlayInstance }) {
  const model = useAppearance(item);
  return model.readable && item.settings ? (
    <AdditionalWidgetFields
      settings={item.settings}
      model={model}
      tab="track"
    />
  ) : null;
}
export function AdditionalWidgetFields({
  settings: s,
  model,
  tab = "content",
}: {
  settings: WidgetSettings;
  model: Model;
  tab?: Tab;
}) {
  const toggle = (
    label: string,
    checked: boolean,
    patch: (value: boolean) => WidgetSettingsPatch,
  ) => (
    <Switch
      key={label}
      label={label}
      checked={checked}
      disabled={model.disabled}
      pending={model.pending}
      onCheckedChange={(value) => void model.patch(patch(value), label)}
    />
  );
  const number = (
    label: string,
    value: number,
    min: number,
    max: number,
    patch: (value: number) => WidgetSettingsPatch,
  ) => (
    <ContentNumber
      key={label}
      label={label}
      value={value}
      min={min}
      max={max}
      model={model}
      onCommit={(value) => void model.patch(patch(value), label)}
    />
  );
  const choose = <T extends string | number>(
    label: string,
    value: string | number,
    choices: readonly T[],
    labels: (value: T) => string,
    patch: (value: T) => WidgetSettingsPatch,
  ) => (
    <Choice
      key={label}
      label={label}
      value={value}
      choices={choices}
      labels={labels}
      model={model}
      onChange={(value) => void model.patch(patch(value), label)}
    />
  );
  let fields: ReactNode[] = [];
  switch (s.kind) {
    case "broadcast-tower":
      fields =
        tab === "track"
          ? [
              toggle(text.carousel, s.driverCarousel, (driverCarousel) => ({
                kind: s.kind,
                driverCarousel,
              })),
            ]
          : [
              number(
                text.rows,
                s.rowCount,
                options.broadcastTower.rowsMin,
                options.broadcastTower.rowsMax,
                (rowCount) => ({ kind: s.kind, rowCount }),
              ),
              toggle(text.weather, s.showWeather, (showWeather) => ({
                kind: s.kind,
                showWeather,
              })),
            ];
      break;
    case "car-damage-numbers":
      if (tab === "content")
        fields = [
          toggle(text.tyres, s.showTyres, (showTyres) => ({
            kind: s.kind,
            showTyres,
          })),
        ];
      break;
    case "car-damage-visual":
      fields =
        tab === "track"
          ? [
              choose(
                text.toggleKey,
                s.toggleKey,
                options.damage.toggleKeys,
                (value) => (value ? value.toUpperCase() : text.noKey),
                (toggleKey) => ({ kind: s.kind, toggleKey }),
              ),
            ]
          : [
              choose(
                text.view,
                s.view,
                options.damage.views,
                (value) => text.views[value],
                (view) => ({ kind: s.kind, view }),
              ),
              toggle(text.aero, s.showAero, (showAero) => ({
                kind: s.kind,
                showAero,
              })),
            ];
      break;
    case "delta-trace":
      if (tab === "content")
        fields = [
          choose(
            text.reference,
            s.reference,
            options.deltaTrace.references,
            (value) => text.references[value],
            (reference) => ({ kind: s.kind, reference }),
          ),
          number(
            text.window,
            s.windowSeconds,
            options.deltaTrace.secondsMin,
            options.deltaTrace.secondsMax,
            (windowSeconds) => ({ kind: s.kind, windowSeconds }),
          ),
        ];
      break;
    case "fastest-lap":
      if (tab === "content")
        fields = [
          toggle(text.personal, s.showPersonal, (showPersonal) => ({
            kind: s.kind,
            showPersonal,
          })),
          toggle(text.class, s.showClass, (showClass) => ({
            kind: s.kind,
            showClass,
          })),
          toggle(text.driver, s.showDriver, (showDriver) => ({
            kind: s.kind,
            showDriver,
          })),
          number(
            text.duration,
            s.durationSeconds,
            options.fastestLap.secondsMin,
            options.fastestLap.secondsMax,
            (durationSeconds) => ({ kind: s.kind, durationSeconds }),
          ),
        ];
      break;
    case "head-to-head":
      if (tab === "content")
        fields = [
          choose(
            text.target,
            s.target,
            options.headToHead.targets,
            (value) => text.targets[value],
            (target) => ({ kind: s.kind, target }),
          ),
        ];
      break;
    case "input-telemetry":
      if (tab === "content")
        fields = [
          number(
            text.history,
            s.historySeconds,
            options.inputTelemetry.secondsMin,
            options.inputTelemetry.secondsMax,
            (historySeconds) => ({ kind: s.kind, historySeconds }),
          ),
          toggle(text.clutch, s.showClutch, (showClutch) => ({
            kind: s.kind,
            showClutch,
          })),
        ];
      break;
    case "track-map":
      if (tab === "content")
        fields = [
          toggle(text.transparent, s.transparent, (transparent) => ({
            kind: s.kind,
            transparent,
          })),
        ];
      break;
    case "multiclass-relative":
      if (tab === "content")
        fields = [
          choose(
            text.rows,
            s.rowCount,
            options.multiclassRelative.rows,
            String,
            (rowCount) => ({ kind: s.kind, rowCount }),
          ),
          choose(
            text.classes,
            s.classMode,
            options.multiclassRelative.classModes,
            (value) => text.classModes[value],
            (classMode) => ({ kind: s.kind, classMode }),
          ),
          toggle(text.divider, s.showClassDivider, (showClassDivider) => ({
            kind: s.kind,
            showClassDivider,
          })),
        ];
      break;
    case "pedals-telemetry":
      if (tab === "content")
        fields = [
          toggle(text.clutch, s.showClutch, (showClutch) => ({
            kind: s.kind,
            showClutch,
          })),
          choose(
            text.wheel,
            s.steeringWheel,
            options.pedalsTelemetry.wheels,
            String,
            (steeringWheel) => ({ kind: s.kind, steeringWheel }),
          ),
        ];
      break;
    case "radar":
      if (tab === "content")
        fields = [
          toggle(text.phrases, s.showPhrases, (showPhrases) => ({
            kind: s.kind,
            showPhrases,
          })),
        ];
      break;
    case "racing-flags":
      fields =
        tab === "track"
          ? [
              toggle(text.hideGreen, s.hideWhenGreen, (hideWhenGreen) => ({
                kind: s.kind,
                hideWhenGreen,
              })),
            ]
          : [
              toggle(
                text.sectorFlags,
                s.showSectorFlags,
                (showSectorFlags) => ({ kind: s.kind, showSectorFlags }),
              ),
              <Color key={text.color} value={s.textColor} model={model} />,
            ];
      break;
    case "track-weather":
      if (tab === "content")
        fields = [
          toggle(text.vertical, s.vertical, (vertical) => ({
            kind: s.kind,
            vertical,
          })),
        ];
      break;
  }
  if (!fields.length) return null;
  const title = tab === "content" ? text.content : text.behavior;
  return (
    <section
      className={
        tab === "track" ? "v-studio-track-group" : "v-studio-appearance-group"
      }
      aria-label={title}
    >
      <h3>{title}</h3>
      {fields}
    </section>
  );
}
function Choice<T extends string | number>({
  label,
  value,
  choices,
  labels,
  model,
  onChange,
}: {
  label: string;
  value: string | number;
  choices: readonly T[];
  labels: (value: T) => string;
  model: Model;
  onChange: (value: T) => void;
}) {
  const known = choices.some((choice) => choice === value);
  return (
    <Select
      label={label}
      value={String(value)}
      disabled={model.disabled}
      pending={model.pending}
      options={[
        ...(!known
          ? [{ value: String(value), label: text.preserved(String(value)) }]
          : []),
        ...choices.map((choice) => ({
          value: String(choice),
          label: labels(choice),
        })),
      ]}
      onChange={(value) => {
        const choice = choices.find((choice) => String(choice) === value);
        if (choice !== undefined) onChange(choice);
      }}
    />
  );
}
function Color({ value, model }: { value: string; model: Model }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  const edited = useRef(false);
  const submitted = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      !edited.current ||
      submitted.current?.toLowerCase() === value.toLowerCase()
    ) {
      edited.current = false;
      submitted.current = undefined;
      setDraft(value);
      setError(false);
    }
  }, [value]);
  const commit = () => {
    if (model.disabled || model.pending || !edited.current) return;
    if (
      draft.length !== options.racingFlags.colorLength ||
      !new RegExp(options.racingFlags.colorPattern).test(draft)
    ) {
      setError(true);
      return;
    }
    if (draft !== value) {
      submitted.current = draft;
      void model.patch({ kind: "racing-flags", textColor: draft }, text.color);
    }
  };
  return (
    <Input
      label={text.color}
      value={draft}
      maxLength={options.racingFlags.colorLength}
      disabled={model.disabled}
      readOnly={model.pending}
      error={error ? text.invalidColor : undefined}
      onChange={(event) => {
        edited.current = true;
        submitted.current = undefined;
        setDraft(event.target.value);
        setError(false);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}
