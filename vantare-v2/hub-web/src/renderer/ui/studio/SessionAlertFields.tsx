import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type {
  OverlayInstance,
  SessionAlertsWidgetSettings,
} from "../../../contract/generated/studio";
import { studioAdditionalOptions } from "../../../contract/generated/studio";
import { studioAlertFieldsText as text } from "../../i18n/studio-alert-fields.es";
import { useAppearance } from "../../screens/studio/appearance";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../Button";
import { Select, Switch } from "../Forms";
import { ContentNumber, Group } from "./ContentControls";

type Model = ReturnType<typeof useAppearance>;
const limits = studioAdditionalOptions.sessionAlerts;
export function SessionAlertBehavior({ item }: { item: OverlayInstance }) {
  const model = useAppearance(item);
  if (!model.readable || item.settings?.kind !== "session-alerts") return null;
  return (
    <SessionAlertFields
      id={item.id}
      settings={item.settings}
      model={model}
      behavior
    />
  );
}
export function SessionAlertFields({
  id,
  settings,
  model,
  behavior = false,
}: {
  id: string;
  settings: SessionAlertsWidgetSettings;
  model: Model;
  behavior?: boolean;
}) {
  const help = useId();
  const flags = behavior
    ? ([
        "soundZero",
        "miniFinal",
        "sound",
        "mini",
        "miniSession",
        "miniCalendar",
        "miniStart",
      ] as const)
    : (["session", "calendar", "finished", "starts"] as const);
  const toggles = flags.map((field) => {
    const unavailable =
      !limits.startSignalsAvailable &&
      (field === "starts" || field === "miniStart");
    return (
      <Switch
        key={field}
        label={text[field]}
        checked={settings[field]}
        disabled={model.disabled || unavailable}
        pending={model.pending}
        aria-describedby={unavailable ? help : undefined}
        onCheckedChange={(value) => {
          if (!unavailable)
            void model.patch(
              { kind: "session-alerts", [field]: value },
              text[field],
            );
        }}
      />
    );
  });
  if (behavior)
    return (
      <section className="v-studio-track-group" aria-label={text.behavior}>
        <h3>{text.behavior}</h3>
        {toggles}
        {!limits.startSignalsAvailable && <p id={help}>{text.signalPending}</p>}
      </section>
    );
  return (
    <div className="v-studio-content">
      <Group title={text.content}>
        {toggles}
        {!limits.startSignalsAvailable && <p id={help}>{text.signalPending}</p>}
        {(
          [
            [
              "durationSeconds",
              limits.secondsMin,
              limits.secondsMax,
              limits.secondsStep,
            ],
            ["volume", limits.volumeMin, limits.volumeMax, limits.volumeStep],
            ["miniLimit", limits.miniLimitMin, limits.miniLimitMax, 1],
          ] as const
        ).map(([field, min, max, step]) => (
          <ContentNumber
            key={field}
            label={text[field]}
            value={settings[field]}
            min={min}
            max={max}
            step={step}
            model={model}
            onCommit={(value) =>
              void model.patch(
                { kind: "session-alerts", [field]: value },
                text[field],
              )
            }
          />
        ))}
        <Select
          label={text.miniSize}
          value={settings.miniSize}
          disabled={model.disabled}
          pending={model.pending}
          options={limits.miniSizes.map((value) => ({
            value,
            label: value.toUpperCase(),
          }))}
          onChange={(value) => {
            const miniSize = limits.miniSizes.find((entry) => entry === value);
            if (miniSize)
              void model.patch(
                { kind: "session-alerts", miniSize },
                text.miniSize,
              );
          }}
        />
        <Select
          label={text.style}
          value={settings.style}
          disabled={model.disabled}
          pending={model.pending}
          options={limits.styles.map((value) => ({
            value,
            label: text.styles[value],
          }))}
          onChange={(value) => {
            const style = limits.styles.find((entry) => entry === value);
            if (style)
              void model.patch({ kind: "session-alerts", style }, text.style);
          }}
        />
      </Group>
      <Thresholds id={id} settings={settings} model={model} />
    </div>
  );
}
function Thresholds({
  id,
  settings,
  model,
}: {
  id: string;
  settings: SessionAlertsWidgetSettings;
  model: Model;
}) {
  const state = useStudio();
  const help = useId();
  const failedHelp = useId();
  const request = state.failure?.request;
  const failed =
    request?.method === "studio.instance" &&
    request.id === id &&
    request.patch.field === "settings" &&
    request.patch.value.kind === "session-alerts" &&
    request.patch.value.threshold !== undefined;
  const [uncertain, setUncertain] = useState(false);
  const [snapshot, setSnapshot] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (failed) setUncertain(true);
  }, [failed]);
  useLayoutEffect(() => {
    if (focusAfter.current !== undefined)
      root.current?.querySelectorAll("input")[focusAfter.current]?.focus();
    focusAfter.current = undefined;
  });
  const blocked = uncertain || failed;
  const refresh = async () => {
    if (model.pending || model.disabled) return;
    const next = await state.execute({ method: "studio.get" });
    if (next?.state === "ready") {
      setUncertain(false);
      setSnapshot((value) => value + 1);
    }
  };
  const save = async (index: number, minutes: number) => {
    if (blocked || model.pending || model.disabled) return;
    const input = root.current?.querySelectorAll("input")[index];
    const next = await model.patch(
      { kind: "session-alerts", threshold: { index, minutes } },
      text.threshold(index),
    );
    if (next) {
      // Native normalization can move/remove a threshold. Render its confirmed
      // array, not the typed number at a now different index.
      if (input && document.activeElement === input) focusAfter.current = index;
      setSnapshot((value) => value + 1);
    }
  };
  return (
    <Group title={text.thresholds}>
      <p id={help}>{text.thresholdHelp}</p>
      {blocked && (
        <>
          <p role="status" id={failedHelp}>
            {text.thresholdUncertain}
          </p>
          <Button
            size="sm"
            aria-disabled={model.pending || model.disabled || undefined}
            onClick={() => void refresh()}
          >
            {text.reload}
          </Button>
        </>
      )}
      <div ref={root}>
        {Array.from({ length: limits.thresholdSlots }, (_, index) => (
          <ContentNumber
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed slot index is the native operation identity; snapshot resets drafts after normalization.
            key={`${snapshot}:${index}`}
            label={text.threshold(index)}
            aria-describedby={blocked ? `${help} ${failedHelp}` : help}
            value={settings.thresholds[index] ?? 0}
            min={limits.thresholdMin}
            max={limits.thresholdMax}
            step={limits.thresholdStep}
            model={{ ...model, pending: model.pending || blocked }}
            onCommit={(minutes) => void save(index, minutes)}
          />
        ))}
      </div>
    </Group>
  );
}
