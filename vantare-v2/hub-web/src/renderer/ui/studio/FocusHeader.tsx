import type { Ref } from "react";
import type {
  OverlayInstance,
  StudioView,
} from "../../../contract/generated/contract";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { canvasText } from "../../i18n/studio-canvas.es";
import { Button } from "../Button";
import { DisabledHint } from "./DisabledHint";
import { MoreMenu } from "./MoreMenu";
import { WidgetThumb, widgetName } from "./Widgets";

export function FocusHeader({
  item,
  view,
  pending,
  onTrack,
  onRemove,
  onCanvas,
  canvasRef,
}: {
  item?: OverlayInstance;
  view: StudioView;
  pending: boolean;
  onTrack: () => void;
  onRemove: () => void;
  onCanvas?: () => void;
  canvasRef?: Ref<HTMLButtonElement>;
}) {
  const info = view.catalog.find((value) => value.kind === item?.kind);
  const unavailable =
    !view.showing &&
    (view.state !== "ready" ||
      view.plan === "unverified" ||
      !view.instances.length);
  return (
    <header className="v-focus-header">
      <div className="v-focus-heading">
        <small>
          {info?.category ??
            (view.state === "ready" && !item ? t.local : undefined)}
        </small>
        <h1>
          {item ? (
            <>
              <WidgetThumb kind={item.kind} icon />
              {widgetName(item, view)}
            </>
          ) : view.state === "ready" ? (
            t.emptyTitle
          ) : (
            t.title
          )}
        </h1>
        {(info || item) && (
          <p>
            {info?.about}
            {item && (
              <span>{t.stageSize(item.size.width, item.size.height)}</span>
            )}
          </p>
        )}
      </div>
      <div className="v-focus-actions">
        {onCanvas && (
          <Button
            ref={canvasRef}
            disabled={view.state !== "ready" || !view.canvas}
            onClick={onCanvas}
          >
            {canvasText.open}
          </Button>
        )}
        {item && (
          <MoreMenu
            item={item}
            view={view}
            pending={pending}
            onRemove={onRemove}
            onCanvas={onCanvas}
          />
        )}
        <DisabledHint
          disabled={unavailable}
          label={
            view.state === "protected"
              ? t.protectedAction
              : view.state === "missing"
                ? t.missingHelp
                : view.plan === "unverified"
                  ? t.verifyWidget
                  : t.showNeedsWidget
          }
        >
          <Button
            variant={view.instances.length ? "primary" : "neutral"}
            disabled={unavailable}
            aria-disabled={pending}
            onClick={() => {
              if (!pending) onTrack();
            }}
          >
            <Icon name={view.showing ? "stop" : "play"} />
            {view.showing ? t.hide : t.show}
          </Button>
        </DisabledHint>
      </div>
    </header>
  );
}
