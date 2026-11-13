import { type ReactNode, useId } from "react";
import type {
  InstancePatch,
  OverlayInstance,
} from "../../../contract/generated/studio";
import { studioLimits } from "../../../contract/generated/studio";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import {
  sessionsSummary,
  trackSessions,
  useTrack,
} from "../../screens/studio/track";
import { Button } from "../Button";
import { Select, Slider, Switch } from "../Forms";
import { DisabledHint } from "./DisabledHint";
import "./studio-track-step.css";

const labels = {
  practice: t.practiceShort,
  qualifying: t.qualifyingShort,
  race: t.raceShort,
};
type OffTrack = Extract<InstancePatch, { field: "offTrack" }>["value"];
const offTrackOptions: { value: OffTrack; label: string }[] = [
  { value: "inherit", label: t.inherit },
  { value: "alwaysVisible", label: t.always },
  { value: "hide", label: t.offHide },
];
export function TrackStep({ item }: { item: OverlayInstance }) {
  const model = useTrack(item);
  const visibleHelp = useId();
  if (!model.readable) return <p>{t.appearanceUnavailable}</p>;
  const { disabled, pending, saving } = model;
  return (
    <div className="v-studio-track-groups" data-pending={pending}>
      <Group
        title={t.visibilityGroup}
        summary={t.trackVisibilitySummary(item.visible, item.opacity)}
        visible={item.visible}
        active={saving === "visible" || saving === "opacity"}
      >
        <div className="v-studio-track-pair">
          <span>
            {t.visibleOnTrack}
            <small id={visibleHelp}>{t.visibleOnTrackHelp}</small>
          </span>
          <Switch
            hideLabel
            aria-describedby={visibleHelp}
            label={t.visibleOnTrack}
            checked={item.visible}
            disabled={disabled}
            pending={pending}
            onCheckedChange={(value) => void model.visibility(value)}
          />
        </div>
        <Slider
          label={t.opacity}
          value={model.opacity}
          min={studioLimits.opacityMin}
          max={studioLimits.opacityMax}
          disabled={disabled}
          pending={pending}
          onChange={model.setOpacity}
          onValueCommitted={(value) =>
            void model.patch({ field: "opacity", value })
          }
        />
      </Group>
      <Group
        title={t.whenGroup}
        summary={sessionsSummary(item)}
        visible={trackSessions.some((key) => item.showIn[key])}
        active={saving === "showIn" || saving === "offTrack"}
      >
        <fieldset className="v-studio-track-sessions" aria-label={t.showIn}>
          {trackSessions.map((key) => (
            <Button
              key={key}
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-disabled={pending || undefined}
              aria-pressed={item.showIn[key]}
              onClick={() => {
                if (!pending)
                  void model.patch({
                    field: "showIn",
                    value: { ...item.showIn, [key]: !item.showIn[key] },
                  });
              }}
            >
              {labels[key]}
            </Button>
          ))}
        </fieldset>
        <div className="v-studio-track-pair">
          <span>
            {t.offTrack}
            <small>{t.offTrackHelp}</small>
          </span>
          <Select
            hideLabel
            label={t.offTrack}
            value={item.offTrack}
            options={offTrackOptions}
            disabled={disabled}
            pending={pending}
            onChange={(value) => {
              const option = offTrackOptions.find(
                (option) => option.value === value,
              );
              if (option)
                void model.patch({ field: "offTrack", value: option.value });
            }}
          />
        </div>
      </Group>
      <Group
        title={t.placeGroup}
        summary={t.placeSummary(item.size.width, item.size.height)}
      >
        <p>{t.placeHelp}</p>
        <DisabledHint label={t.editHelp}>
          <Button disabled>
            <Icon name="v-studio" />
            {t.edit}
          </Button>
        </DisabledHint>
      </Group>
    </div>
  );
}
function Group({
  title,
  summary,
  visible,
  active,
  children,
}: {
  title: string;
  summary: string;
  visible?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="v-studio-track-group"
      aria-label={title}
      data-active={active}
    >
      <h3>{title}</h3>
      <div className="v-studio-track-summary" data-visible={visible}>
        {summary}
      </div>
      {children}
    </section>
  );
}
