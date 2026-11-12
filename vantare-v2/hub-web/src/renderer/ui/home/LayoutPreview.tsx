import { useLayoutEffect, useRef, useState } from "react";
import type { HomeLayoutView } from "../../../contract/generated/contract";
import { homeText as t } from "../../i18n/home";
import { WidgetThumb } from "../widgets/WidgetThumb";

export function LayoutPreview({ layout }: { layout: HomeLayoutView }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const widgets = layout.widgets;
  const left = Math.min(...widgets.map((w) => w.x));
  const top = Math.min(...widgets.map((w) => w.y));
  const width = Math.max(...widgets.map((w) => w.x + w.w)) - left;
  const height = Math.max(...widgets.map((w) => w.y + w.h)) - top;
  const scale = Math.max(
    0.01,
    Math.min((size.w - 16) / width, (size.h - 16) / height, 1),
  );
  return (
    <div className="v-home-preview" ref={ref}>
      {widgets.length ? (
        widgets.map((w, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: Stateless snapshot slots may contain identical widgets at identical coordinates.
            key={index}
            role="img"
            aria-label={t.widgets[w.kind] ?? w.kind}
            className="v-home-widget"
            style={{
              position: "absolute",
              left: (size.w - width * scale) / 2 + (w.x - left) * scale,
              top: (size.h - height * scale) / 2 + (w.y - top) * scale,
              width: w.w * scale,
              height: w.h * scale,
              opacity: w.opacity / 100,
            }}
          >
            <WidgetThumb kind={w.kind} fit="fill" />
          </div>
        ))
      ) : (
        <span>{t.noWidgets}</span>
      )}
    </div>
  );
}
