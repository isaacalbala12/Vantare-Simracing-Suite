import { Popover } from "@base-ui/react/popover";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type {
  OverlayInstance,
  StudioView,
} from "../../../contract/generated/contract";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { Button } from "../Button";
import { Callout } from "../Data";
import { DisabledHint } from "./DisabledHint";
import { usePreviewPhoto } from "./usePreviewPhoto";
import { VisibilityIcon, WidgetPreview } from "./Widgets";

export function Stage({
  item,
  view,
  name,
  blocked,
  pending,
  onShow,
  actions,
  canvasPreview,
}: {
  item: OverlayInstance;
  view: StudioView;
  name: string;
  blocked: boolean;
  pending: boolean;
  onShow: () => void;
  actions?: ReactNode;
  canvasPreview?: ReactNode;
}) {
  const photo = usePreviewPhoto(item, view);
  const p = t.preview;
  const real = photo.status === "photo";
  const preparing = photo.status === "preparing";
  const failed = ["gpuUnavailable", "captureFailed", "invalidInput"].includes(
    photo.status,
  );
  const retry =
    [
      "gpuUnavailable",
      "captureFailed",
      "timeout",
      "busy",
      "studioConflict",
    ].includes(photo.status) || photo.retrying;
  const title = preparing
    ? p.preparing
    : real
      ? p.photo
      : failed
        ? p.failed
        : photo.status === "timeout"
          ? p.timeout
          : photo.status === "tooLarge"
            ? p.tooLarge
            : photo.status === "busy"
              ? p.busy
              : p.drawing;
  const reason = preparing
    ? ""
    : real
      ? p.example
      : photo.status === "noDemo"
        ? p.noDemo
        : ["unavailable", "graphicsDisabled"].includes(photo.status)
          ? p.unavailable
          : photo.status === "denied"
            ? p.protected
            : photo.status === "studioConflict"
              ? p.changed
              : p.fallback;
  const announcement =
    preparing || photo.status === "denied" || photo.status === "studioConflict"
      ? ""
      : real
        ? p.announcements.photo
        : photo.status === "noDemo"
          ? p.announcements.noDemo
          : ["unavailable", "graphicsDisabled"].includes(photo.status)
            ? p.announcements.unavailable
            : photo.status === "timeout"
              ? p.announcements.timeout
              : photo.status === "tooLarge"
                ? p.announcements.tooLarge
                : photo.status === "busy"
                  ? p.announcements.busy
                  : p.announcements.failed;
  const info = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const retryFocused = useRef(false);
  const description = useId();
  const fit = useRef<HTMLDivElement>(null);
  const [percent, setPercent] = useState(100);
  useEffect(() => {
    if (real && retryFocused.current) info.current?.focus();
    if (!preparing) retryFocused.current = false;
  }, [real, preparing]);
  useEffect(() => {
    const node = fit.current;
    if (!node || !photo.image) return;
    const image = photo.image;
    const measure = () => {
      const box = node.getBoundingClientRect();
      setPercent(
        Math.floor(
          Math.min(1, box.width / image.width, box.height / image.height) * 100,
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [photo.image]);
  return (
    <section className="v-focus-stage v-preview-stage" data-photo={real}>
      <header>
        <div className="v-preview-source">
          <span
            className="v-preview-seal"
            data-warning={
              failed ||
              photo.status === "timeout" ||
              photo.status === "tooLarge"
            }
          >
            <span className={preparing ? "v-preview-spinner" : undefined}>
              <Icon
                name={
                  preparing
                    ? "refresh"
                    : real
                      ? "v-camera"
                      : failed || photo.status === "tooLarge"
                        ? "alert"
                        : photo.status === "timeout" || photo.status === "busy"
                          ? "clock"
                          : photo.status === "denied"
                            ? "lock"
                            : "pencil"
                }
              />
            </span>
            <b>{title}</b>
            {reason && <span className="v-preview-reason">{reason}</span>}
          </span>
          <Popover.Root modal={false}>
            <Popover.Trigger
              ref={info}
              aria-label={p.info}
              className="v-preview-info"
            >
              <Icon name="info" />
            </Popover.Trigger>
            <Popover.Positioner
              className="v-positioner"
              align="start"
              sideOffset={6}
            >
              <Popover.Popup className="v-preview-help" initialFocus={false}>
                <div role="note">
                  <b>{p.helpTitle}</b>
                  <p>{real ? p.photoHelp : p.drawingHelp}</p>
                  {real && (
                    <ul>
                      {p.photoFacts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Root>
          {retry && (
            <Button
              ref={retryButton}
              className="v-preview-regenerate"
              aria-label={preparing ? p.generatingLabel : p.retryLabel}
              aria-disabled={preparing}
              onClick={() => {
                if (preparing) return;
                retryFocused.current =
                  document.activeElement === retryButton.current;
                photo.regenerate();
              }}
              onBlur={() => {
                retryFocused.current = false;
              }}
            >
              <Icon name="refresh" />
              {preparing ? p.generating : p.retry}
            </Button>
          )}
        </div>
        <div className="v-studio-stage-actions">
          {actions}
          <fieldset aria-label={t.dataLabel}>
            <span>{t.dataLabel}</span>
            <Button size="sm" variant="ghost" aria-pressed="true">
              {t.example}
            </Button>
            <DisabledHint label={t.liveHelp}>
              <Button size="sm" variant="ghost" disabled>
                {t.live}
              </Button>
            </DisabledHint>
          </fieldset>
        </div>
      </header>
      <div
        className="v-focus-drawing"
        role="img"
        aria-label={real ? p.photoLabel(name) : p.drawingLabel(name)}
        aria-describedby={description}
      >
        {real && photo.image ? (
          <div className="v-preview-fit" ref={fit}>
            <img
              alt=""
              className="v-preview-photo"
              src={photo.src}
              style={{
                width: `${photo.image.width}px`,
                maxWidth: "100%",
                maxHeight: "100%",
              }}
            />
          </div>
        ) : (
          <div aria-hidden="true">
            <WidgetPreview
              kind={item.kind}
              opacity={item.opacity}
              visible={item.visible}
              locked={item.locked}
              unverified={blocked}
              stage
            />
          </div>
        )}
      </div>
      <span className="v-sr-only" id={description}>
        {real ? p.photoHelp : p.drawingHelp}
      </span>
      <span className="v-sr-only" role="status" aria-atomic="true">
        {announcement}
      </span>
      {real && photo.image && (
        <div className="v-preview-metadata">
          <span>{p.size(photo.image.width, photo.image.height, percent)}</span>
          <span>
            <i />
            {p.transparent}
          </span>
        </div>
      )}
      {photo.status === "studioConflict" && (
        <Callout title={p.conflictTitle}>{p.conflictBody}</Callout>
      )}
      {canvasPreview}
      {!item.visible && (
        <div className="v-focus-hidden">
          <span>
            <VisibilityIcon visible={false} />
            {t.hiddenStage}
          </span>
          <Button
            size="sm"
            variant="neutral"
            disabled={blocked || item.locked}
            aria-disabled={pending}
            onClick={() => {
              if (!pending) onShow();
            }}
          >
            <VisibilityIcon visible />
            {t.showNow}
          </Button>
        </div>
      )}
      <footer>
        <span>{t.sceneLabel}</span>
        <DisabledHint label={t.scenesSoon}>
          <fieldset aria-label={t.sceneLabel}>
            {t.scenes.map((scene) => (
              <Button
                key={scene}
                size="sm"
                variant="ghost"
                disabled
                aria-pressed={scene === "Boxes"}
              >
                {scene}
              </Button>
            ))}
          </fieldset>
        </DisabledHint>
      </footer>
    </section>
  );
}
