import { Popover } from "@base-ui/react/popover";
import type { GeometryChange } from "../../../contract/generated/studio";
import { canvasText as t } from "../../i18n/studio-canvas";
import { anchor, nudge, type Pair } from "../../screens/studio/geometry";
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
  const directions: Pair[] = [
    [-1, 0],
    [0, -1],
    [1, 0],
    [0, 1],
  ];
  const move = (direction: Pair) => {
    if (!enabled) return;
    const p = nudge([box.x, box.y], direction, false);
    if (p)
      write({ kind: "move", x: p[0], y: p[1] }, { ...box, x: p[0], y: p[1] });
  };
  return (
    <div className="v-studio-canvas-tools">
      <fieldset aria-label={t.moveGroup}>
        {directions.map((direction, i) => (
          <Button
            key={t.nudge[i]}
            size="sm"
            variant="ghost"
            aria-label={t.nudge[i]}
            aria-disabled={!enabled}
            onClick={() => move(direction)}
          >
            {["←", "↑", "→", "↓"][i]}
          </Button>
        ))}
      </fieldset>
      <Popover.Root>
        <Popover.Trigger render={<Button size="sm" variant="ghost" />}>
          {t.anchors}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="v-positioner" sideOffset={6}>
            <Popover.Popup
              className="v-popover v-studio-canvas-anchors"
              aria-label={t.anchors}
            >
              {Array.from({ length: 9 }, (_, i) => {
                const row = Math.floor(i / 3),
                  column = i % 3;
                return (
                  <Button
                    key={`${row}:${column}`}
                    size="sm"
                    variant="ghost"
                    aria-label={t.anchor(t.rows[row], t.columns[column])}
                    aria-disabled={!enabled}
                    onClick={() => {
                      if (!enabled) return;
                      const p = anchor(
                        [box.size.width, box.size.height],
                        canvas,
                        column,
                        row,
                      );
                      if (p)
                        write(
                          { kind: "anchor", column, row },
                          { ...box, x: p[0], y: p[1] },
                        );
                    }}
                  >
                    {["↖", "↑", "↗", "←", "·", "→", "↙", "↓", "↘"][i]}
                  </Button>
                );
              })}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Button
        size="sm"
        variant="ghost"
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
        {t.lockAspect}
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
