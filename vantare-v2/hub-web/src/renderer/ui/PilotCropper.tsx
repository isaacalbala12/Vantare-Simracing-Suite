import { useEffect, useRef } from "react";
import { pilotEditorLimits } from "../../contract/generated/contract";
import { pilotText as text } from "../i18n/pilot.es";
import {
  moveCrop,
  type PhotoCrop,
  zoomCrop,
} from "../screens/settings/photo-crop";
import { Button } from "./Button";
import "./pilot-cropper.css";
export function PilotCropper({
  image,
  crop,
  pending,
  onChange,
  onCancel,
  onApply,
}: {
  image: ImageBitmap;
  crop: PhotoCrop;
  pending: boolean;
  onChange: (crop: PhotoCrop) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number } | undefined>(undefined);
  const scale = Math.min(320 / image.width, 220 / image.height);
  const width = Math.round(image.width * scale),
    height = Math.round(image.height * scale);
  const side = crop.side * Math.min(width, height);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const context = node.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
  }, [image, width, height]);
  const move = (dx: number, dy: number) => {
    if (!pending) onChange(moveCrop(crop, dx, dy, image.width, image.height));
  };
  const zoom = (factor: number) => {
    if (!pending) onChange(zoomCrop(crop, factor, image.width, image.height));
  };
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (pending || !event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      onChange(
        zoomCrop(
          crop,
          event.deltaY < 0 ? 1.1 : 1 / 1.1,
          image.width,
          image.height,
        ),
      );
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [crop, image, pending, onChange]);
  return (
    <div className="v-pilot-cropper">
      <button
        ref={stage}
        type="button"
        aria-label={text.cropLabel}
        tabIndex={0}
        className="v-pilot-crop-stage"
        style={{ width, height }}
        onKeyDown={(event) => {
          if (pending) return;
          switch (event.key) {
            case "ArrowLeft":
              move(-0.02, 0);
              break;
            case "ArrowRight":
              move(0.02, 0);
              break;
            case "ArrowUp":
              move(0, -0.02);
              break;
            case "ArrowDown":
              move(0, 0.02);
              break;
            case "+":
            case "=":
              zoom(1.25);
              break;
            case "-":
              zoom(0.8);
              break;
            default:
              return;
          }
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          if (pending || event.button !== 0) return;
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          if (!drag.current || pending) return;
          const last = drag.current;
          drag.current = { x: event.clientX, y: event.clientY };
          move(
            (event.clientX - last.x) / width,
            (event.clientY - last.y) / height,
          );
        }}
        onPointerUp={(event) => {
          drag.current = undefined;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          drag.current = undefined;
        }}
      >
        <canvas ref={canvas} width={width} height={height} />
        <span
          className="v-pilot-crop-veil"
          style={{ left: 0, top: 0, width, height: crop.y * height }}
        />
        <span
          className="v-pilot-crop-veil"
          style={{
            left: 0,
            top: crop.y * height + side,
            width,
            height: Math.max(0, height - crop.y * height - side),
          }}
        />
        <span
          className="v-pilot-crop-veil"
          style={{
            left: 0,
            top: crop.y * height,
            width: crop.x * width,
            height: side,
          }}
        />
        <span
          className="v-pilot-crop-veil"
          style={{
            left: crop.x * width + side,
            top: crop.y * height,
            width: Math.max(0, width - crop.x * width - side),
            height: side,
          }}
        />
        <span
          className="v-pilot-crop-square"
          style={{
            left: crop.x * width,
            top: crop.y * height,
            width: side,
            height: side,
          }}
        >
          <span />
        </span>
      </button>
      <div className="v-pilot-crop-actions">
        <strong>{text.cropTitle}</strong>
        <p>{text.cropHelp}</p>
        <div>
          <Button
            size="sm"
            disabled={pending || crop.side >= 1}
            onClick={() => zoom(0.8)}
          >
            {text.zoomOut}
          </Button>
          <Button
            size="sm"
            disabled={pending || crop.side <= pilotEditorLimits.cropMinSide}
            onClick={() => zoom(1.25)}
          >
            {text.zoomIn}
          </Button>
        </div>
        <span className="v-pilot-crop-spacer" aria-hidden="true" />
        <div className="v-pilot-crop-confirm">
          <Button size="sm" disabled={pending} onClick={onCancel}>
            {text.cropCancel}
          </Button>
          <Button variant="primary" busy={pending} onClick={onApply}>
            {text.cropApply}
          </Button>
        </div>
      </div>
    </div>
  );
}
