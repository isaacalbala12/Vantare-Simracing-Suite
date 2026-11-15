import { Popover } from "@base-ui/react/popover";
import { useRef, useState } from "react";
import type { GeometryChange } from "../../../contract/generated/studio";
import { canvasText as t } from "../../i18n/studio-canvas";
import { anchor, type Pair } from "../../screens/studio/geometry";
import type { Box } from "../../screens/studio/gesture-state";
import { Button } from "../Button";

export function CanvasTools({
  box,
  canvas,
  enabled,
  write,
}: {
  box: Box;
  canvas: Pair;
  enabled: boolean;
  write: (change: GeometryChange, target: Box) => void;
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(4);
  const points = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="v-studio-canvas-tools">
      <Popover.Root modal={false} open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={<Button size="sm" variant="ghost" />}
          aria-label={t.anchors}
        >
          {t.anchorShort}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            className="v-positioner"
            sideOffset={8}
            side="top"
          >
            <Popover.Popup
              className="v-popover v-studio-canvas-anchors"
              aria-label={t.anchors}
              initialFocus={() => points.current[active]}
            >
              <strong>{t.anchorShort}</strong>
              <div role="toolbar" aria-label={t.anchors}>
                {[0, 1, 2].map((row) => (
                  <div key={row}>
                    {[0, 1, 2].map((column) => {
                      const i = row * 3 + column;
                      return (
                        <span key={column}>
                          <Button
                            ref={(node) => {
                              points.current[i] = node;
                            }}
                            tabIndex={active === i ? 0 : -1}
                            size="sm"
                            variant="ghost"
                            aria-label={t.anchor(
                              t.rows[row],
                              t.columns[column],
                            )}
                            aria-disabled={!enabled}
                            onFocus={() => setActive(i)}
                            onKeyDown={(event) => {
                              const next =
                                event.key === "ArrowLeft" && column > 0
                                  ? i - 1
                                  : event.key === "ArrowRight" && column < 2
                                    ? i + 1
                                    : event.key === "ArrowUp" && row > 0
                                      ? i - 3
                                      : event.key === "ArrowDown" && row < 2
                                        ? i + 3
                                        : event.key === "Home"
                                          ? 0
                                          : event.key === "End"
                                            ? 8
                                            : i;
                              if (next !== i) {
                                event.preventDefault();
                                points.current[next]?.focus();
                              }
                            }}
                            onClick={() => {
                              if (!enabled) return;
                              const p = anchor(
                                [box.size.width, box.size.height],
                                canvas,
                                column,
                                row,
                              );
                              if (p) {
                                write(
                                  { kind: "anchor", column, row },
                                  { ...box, x: p[0], y: p[1] },
                                );
                                setOpen(false);
                              }
                            }}
                          >
                            <i />
                          </Button>
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
              <small>{t.anchorHelp}</small>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t.lockAspect}
        aria-pressed={box.aspectLocked}
        aria-disabled={!enabled}
        onClick={() => {
          if (enabled)
            write(
              { kind: "aspectLocked", value: !box.aspectLocked },
              { ...box, aspectLocked: !box.aspectLocked },
            );
        }}
      >
        {t.proportions}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-disabled={!enabled || box.sizeMode === "auto"}
        onClick={() => {
          if (enabled && box.sizeMode !== "auto")
            write({ kind: "autoSize" }, { ...box, sizeMode: "auto" });
        }}
      >
        {t.natural}
      </Button>
    </div>
  );
}
