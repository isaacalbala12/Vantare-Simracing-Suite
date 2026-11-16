import { Popover } from "@base-ui/react/popover";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useState } from "react";
import type {
  CanvasChoice,
  StudioView,
} from "../../../contract/generated/studio";
import { canvasText as t } from "../../i18n/studio-canvas";
import { Button } from "../Button";
import "../performance.css";

export const canvasPresets = [
  [1920, 1080],
  [2560, 1440],
  [3440, 1440],
  [3840, 2160],
] as const;
export function CanvasResolution({
  canvas,
  monitor,
  enabled,
  onChange,
}: {
  canvas: StudioView["canvas"];
  monitor: StudioView["monitor"];
  enabled: boolean;
  onChange: (choice: CanvasChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!monitor) return null;
  const size = canvas?.source === "custom" ? canvas : monitor;
  const sameMonitor =
    canvas?.width === monitor.width && canvas?.height === monitor.height;
  const value =
    canvas?.source === "custom" && !sameMonitor
      ? `${canvas.width}x${canvas.height}`
      : "monitor";
  const monitorPreset = canvasPresets.find(
    ([w, h]) => w === monitor.width && h === monitor.height,
  );
  return (
    <Popover.Root
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (!next || enabled) setOpen(next);
      }}
    >
      <Popover.Trigger
        render={<Button size="sm" variant="ghost" />}
        aria-label={t.resolution}
        aria-disabled={!enabled}
      >
        {canvas?.source !== "custom" ? `${t.monitor} · ` : ""}
        {`${size.width} × ${size.height} ▾`}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="v-positioner"
          side="top"
          align="start"
          sideOffset={8}
        >
          <Popover.Popup
            className="v-popover v-canvas-resolutions"
            aria-label={t.resolution}
          >
            <RadioGroup
              aria-label={t.resolution}
              value={value}
              aria-disabled={!enabled}
              onValueChange={(next) => {
                if (!enabled || next === value) return;
                if (next === "monitor") {
                  onChange({ kind: "monitor" });
                } else {
                  const preset = canvasPresets.find(
                    ([w, h]) => `${w}x${h}` === next,
                  );
                  if (preset)
                    onChange({
                      kind: "custom",
                      width: preset[0],
                      height: preset[1],
                    });
                }
              }}
            >
              <Radio.Root
                value="monitor"
                className="v-performance-level"
                aria-disabled={!enabled}
                onClick={() => {
                  if (enabled && canvas?.source === "custom" && sameMonitor)
                    onChange({ kind: "monitor" });
                }}
              >
                <strong>
                  {monitorPreset
                    ? `${monitor.width} × ${monitor.height} · ${monitor.width / monitor.height > 2 ? t.ultrawide : t.widescreen}`
                    : `${t.monitor} · ${monitor.width} × ${monitor.height}`}
                </strong>
                {monitorPreset && <small>{t.monitor}</small>}
              </Radio.Root>
              {canvasPresets
                .filter(([w, h]) => w !== monitor.width || h !== monitor.height)
                .map(([w, h]) => (
                  <Radio.Root
                    key={w}
                    value={`${w}x${h}`}
                    className="v-performance-level"
                    aria-disabled={!enabled}
                  >
                    <strong>{`${w} × ${h} · ${w / h > 2 ? t.ultrawide : t.widescreen}`}</strong>
                  </Radio.Root>
                ))}
            </RadioGroup>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
