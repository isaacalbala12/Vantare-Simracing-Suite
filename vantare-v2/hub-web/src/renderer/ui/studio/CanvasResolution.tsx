import { Popover } from "@base-ui/react/popover";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useId, useState } from "react";
import type {
  CanvasChoice,
  StudioView,
} from "../../../contract/generated/studio";
import { canvasText as t } from "../../i18n/studio-canvas";
import { Button } from "../Button";
import { DisabledHint } from "./DisabledHint";
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
  const description = useId();
  if (!monitor)
    return (
      <>
        <DisabledHint label={t.monitorNotDetectedHelp}>
          <Button
            size="sm"
            variant="ghost"
            disabled
            aria-describedby={description}
          >
            {t.monitorNotDetected}
          </Button>
        </DisabledHint>
        <span id={description} className="v-canvas-accessible-help">
          {t.monitorNotDetectedHelp}
        </span>
      </>
    );
  const size = canvas?.source === "custom" ? canvas : monitor;
  const value =
    canvas?.source === "custom"
      ? `${canvas.width}x${canvas.height}`
      : "monitor";
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
        <Popover.Positioner className="v-positioner" sideOffset={8}>
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
              >
                <strong>{t.monitor}</strong>
                <small>{`${monitor.width} × ${monitor.height}`}</small>
              </Radio.Root>
              {canvasPresets.map(([w, h]) => (
                <Radio.Root
                  key={w}
                  value={`${w}x${h}`}
                  className="v-performance-level"
                  aria-disabled={!enabled}
                >
                  <strong>{`${w} × ${h}`}</strong>
                  <small>{w / h > 2 ? t.ultrawide : t.widescreen}</small>
                </Radio.Root>
              ))}
            </RadioGroup>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
