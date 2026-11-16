import { Popover } from "@base-ui/react/popover";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useRef, useState } from "react";
import type {
  CanvasChoice,
  CanvasView,
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
  enabled,
  onChange,
}: {
  canvas: CanvasView;
  enabled: boolean;
  onChange: (choice: CanvasChoice) => void;
}) {
  const monitor = useRef<string | undefined>(undefined);
  const [open, setOpen] = useState(false);
  if (canvas.source === "monitor")
    monitor.current = `${canvas.width} × ${canvas.height}`;
  const value =
    canvas.source === "monitor"
      ? "monitor"
      : `${canvas.width}x${canvas.height}`;
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
        {canvas.source === "monitor" ? `${t.monitor} · ` : ""}
        {`${canvas.width} × ${canvas.height} ▾`}
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
                if (next === "monitor") onChange({ kind: "monitor" });
                else {
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
                <small>{monitor.current ?? t.detectedOnReturn}</small>
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
