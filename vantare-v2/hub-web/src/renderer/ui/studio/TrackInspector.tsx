import { useEffect, useState } from "react";
import type { OverlayInstance } from "../../../contract/generated/contract";
import { studioLimits } from "../../../contract/generated/studio";
import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Button } from "../Button";
import { Select, Slider, Switch } from "../Forms";

export function TrackInspector({ item }: { item: OverlayInstance }) {
  const state = useStudio(),
    [opacity, setOpacity] = useState(item.opacity);
  const view = state.view;
  useEffect(() => {
    if (!state.pending) setOpacity(item.opacity);
  }, [item.opacity, state.pending]);
  if (!view) return null;
  const disabled =
    view.state !== "ready" || view.plan === "unverified" || item.locked;
  const patch = (
    value: import("../../../contract/generated/contract").InstancePatch,
  ) => {
    if (state.pending) return;
    void state.execute({
      method: "studio.instance",
      id: item.id,
      patch: value,
      baseRevision: view.revision,
    });
  };
  return (
    <div className="v-studio-inspector-fields">
      <Switch
        label={t.visible}
        checked={item.visible}
        disabled={disabled}
        pending={state.pending}
        onCheckedChange={(visible) => {
          if (state.pending) return;
          void state.execute({
            method: "studio.visibility",
            id: item.id,
            visible,
            baseRevision: view.revision,
          });
        }}
      />
      <Slider
        label={t.opacity}
        value={opacity}
        min={studioLimits.opacityMin}
        max={studioLimits.opacityMax}
        disabled={disabled}
        pending={state.pending}
        onChange={setOpacity}
        onValueCommitted={(value) => patch({ field: "opacity", value })}
      />
      <fieldset>
        <legend>{t.showIn}</legend>
        {(
          [
            ["practice", t.practice],
            ["qualifying", t.qualifying],
            ["race", t.race],
          ] as const
        ).map(([key, label]) => (
          <Switch
            key={key}
            label={label}
            checked={item.showIn[key]}
            disabled={disabled}
            pending={state.pending}
            onCheckedChange={(value) =>
              patch({
                field: "showIn",
                value: { ...item.showIn, [key]: value === true },
              })
            }
          />
        ))}
      </fieldset>
      <Select
        label={t.offTrack}
        pending={state.pending}
        value={item.offTrack}
        disabled={disabled}
        options={[
          { value: "inherit", label: t.inherit },
          { value: "alwaysVisible", label: t.always },
          { value: "hide", label: t.offHide },
        ]}
        onChange={(value) => {
          if (
            value === "inherit" ||
            value === "alwaysVisible" ||
            value === "hide"
          )
            patch({ field: "offTrack", value });
        }}
      />
      <Button
        disabled={disabled}
        variant="danger"
        aria-disabled={state.pending || disabled}
        onClick={() => {
          if (!state.pending) state.setRemoving(item.id);
        }}
      >
        {t.remove}
      </Button>
    </div>
  );
}
