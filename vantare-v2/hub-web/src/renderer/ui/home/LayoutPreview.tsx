import { useLayoutEffect, useRef, useState } from "react";
import type { HomeLayoutView } from "../../../contract/generated/contract";
import { homeText as t } from "../../i18n/home";
import artwork from "./widget-artwork.json";

const assets = import.meta.glob<string>("../../assets/widgets/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
export function widgetAsset(kind: string): string | undefined {
  return assets[`../../assets/widgets/${kind}.svg`];
}
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
          <svg
            // biome-ignore lint/suspicious/noArrayIndexKey: Stateless snapshot slots may contain identical widgets at identical coordinates.
            key={index}
            className="v-home-widget"
            role="img"
            aria-label={t.widgets[w.kind] ?? w.kind}
            viewBox={artwork[w.kind].content.join(" ")}
            preserveAspectRatio="none"
            style={{
              position: "absolute",
              left: (size.w - width * scale) / 2 + (w.x - left) * scale,
              top: (size.h - height * scale) / 2 + (w.y - top) * scale,
              width: w.w * scale,
              height: w.h * scale,
              opacity: w.opacity / 100,
            }}
          >
            <image
              href={widgetAsset(w.kind)}
              x={artwork[w.kind].source[0]}
              y={artwork[w.kind].source[1]}
              width={artwork[w.kind].source[2]}
              height={artwork[w.kind].source[3]}
              preserveAspectRatio="none"
            />
          </svg>
        ))
      ) : (
        <span>{t.noWidgets}</span>
      )}
    </div>
  );
}
