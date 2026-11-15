import type { RefObject } from "react";
import { useEffect, useId, useState } from "react";
import type { OverlayInstance } from "../../../contract/generated/studio";
import { studioGeometryLimits as limits } from "../../../contract/generated/studio";
import { canvasText as t } from "../../i18n/studio-canvas.es";
import type { CanvasWriter } from "../../screens/studio/canvas-writer";
import { resize } from "../../screens/studio/geometry";
import { Button } from "../Button";
import { Input, Switch } from "../Forms";
export function CanvasFields({
  item,
  writer,
  disabled,
  widthRef,
}: {
  item: OverlayInstance;
  writer: CanvasWriter;
  disabled: boolean;
  widthRef: RefObject<HTMLInputElement | null>;
}) {
  const [values, setValues] = useState(() => ({
    x: String(item.x),
    y: String(item.y),
    width: String(item.size.width),
    height: String(item.size.height),
  }));
  const [error, setError] = useState<keyof typeof values>();
  const help = useId();
  useEffect(() => {
    setValues({
      x: String(item.x),
      y: String(item.y),
      width: String(item.size.width),
      height: String(item.size.height),
    });
    setError(undefined);
  }, [item.x, item.y, item.size.width, item.size.height]);
  function commit(field: keyof typeof values) {
    if (disabled || writer.inflight) return;
    const n = Number(values[field]);
    const previous =
      field === "x" || field === "y" ? item[field] : item.size[field];
    if (values[field].trim() && n === previous) return;
    const limit =
      field === "x" || field === "y"
        ? limits.nudgeLimit
        : limits.maxSize[field === "width" ? 0 : 1];
    const min =
      field === "x" || field === "y"
        ? -limit
        : limits.minSize[field === "width" ? 0 : 1];
    if (!values[field].trim() || !Number.isFinite(n) || n < min || n > limit) {
      setError(field);
      return;
    }
    if (field === "x" || field === "y")
      writer.enqueue(item.id, {
        kind: "move",
        x: field === "x" ? n : item.x,
        y: field === "y" ? n : item.y,
      });
    else {
      const r = resize(
        [item.x, item.y],
        [item.size.width, item.size.height],
        field === "width" ? [1, 0] : [0, 1],
        field === "width"
          ? [n - item.size.width, 0]
          : [0, n - item.size.height],
        item.aspectLocked,
      );
      if (r)
        writer.enqueue(item.id, {
          kind: "resize",
          x: r[0][0],
          y: r[0][1],
          width: r[1][0],
          height: r[1][1],
        });
    }
  }
  return (
    <section className="v-canvas-fields" aria-label={t.geometry}>
      <h3>{t.geometry}</h3>
      {item.canvasPlacement === "outside" && <p role="status">{t.outside}</p>}
      <div className="v-canvas-numbers">
        {(["x", "y", "width", "height"] as const).map((field) => (
          <Input
            key={field}
            ref={field === "width" ? widthRef : undefined}
            label={t[field]}
            inputMode="decimal"
            value={values[field]}
            error={error === field ? t.invalid : undefined}
            readOnly={disabled || !!writer.inflight}
            aria-describedby={help}
            onChange={(e) => {
              setValues({ ...values, [field]: e.currentTarget.value });
              setError(undefined);
            }}
            onBlur={() => commit(field)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                commit(field);
              }
            }}
          />
        ))}
      </div>
      <p id={help}>{t.help}</p>
      <Switch
        label={t.aspect}
        checked={item.aspectLocked}
        disabled={disabled}
        pending={!!writer.inflight}
        onCheckedChange={(value) => {
          if (!writer.inflight)
            writer.enqueue(item.id, { kind: "aspectLocked", value });
        }}
      />
      <Button
        size="sm"
        aria-disabled={
          disabled || !!writer.inflight || item.sizeMode === "auto"
        }
        onClick={() => {
          if (!disabled && !writer.inflight)
            writer.enqueue(item.id, { kind: "autoSize" });
        }}
      >
        {t.auto}
      </Button>
      <fieldset className="v-canvas-anchors">
        <legend>{t.anchor}</legend>
        {t.anchors.map((name, index) => (
          <Button
            key={name}
            size="sm"
            variant="ghost"
            aria-label={name}
            aria-disabled={disabled}
            onClick={() => {
              if (!disabled)
                writer.enqueue(item.id, {
                  kind: "anchor",
                  column: index % 3,
                  row: Math.floor(index / 3),
                });
            }}
          >
            {["↖", "↑", "↗", "←", "·", "→", "↙", "↓", "↘"][index]}
          </Button>
        ))}
      </fieldset>
    </section>
  );
}
