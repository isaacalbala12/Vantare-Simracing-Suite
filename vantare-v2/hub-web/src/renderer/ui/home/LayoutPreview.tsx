import { useLayoutEffect, useRef, useState } from "react";
import type { HomeLayoutView } from "../../../contract/generated/contract";
import { homeText as t } from "../../i18n/home";
import { WidgetThumb } from "../widgets/WidgetThumb";
import type { HomePhotos } from "./useHomePhotos";

export function LayoutPreview({
  layout,
  photos,
}: {
  layout: HomeLayoutView;
  photos?: HomePhotos;
}) {
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
  const canvas = photos?.snapshot.canvas;
  const planeWidth = canvas?.width ?? 1;
  const planeHeight = canvas?.height ?? 1;
  const frameWidth = Math.min(size.w, (size.h * 16) / 9);
  const frameHeight = (frameWidth * 9) / 16;
  const photoScale = Math.min(
    frameWidth / planeWidth,
    frameHeight / planeHeight,
  );
  return (
    <div className="v-home-preview" ref={ref}>
      {photos ? (
        <div className="v-home-photo-layer">
          {photos.snapshot.instances.map((item) => {
            const photo = photos.photos.get(item.id);
            return (
              <div
                key={item.id}
                role="img"
                aria-label={t.widgets[item.kind] ?? item.kind}
                className="v-home-widget"
                style={{
                  position: "absolute",
                  left:
                    (size.w - planeWidth * photoScale) / 2 +
                    item.x * photoScale,
                  top:
                    (size.h - planeHeight * photoScale) / 2 +
                    item.y * photoScale,
                  width: item.size.width * photoScale,
                  height: item.size.height * photoScale,
                  opacity: item.opacity / 100,
                }}
              >
                {photo && (
                  <img
                    src={photo.src}
                    alt={t.decorative}
                    width={photo.width}
                    height={photo.height}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : widgets.length ? (
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
