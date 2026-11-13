import type { OverlayInstance } from "../../../contract/generated/contract";
import { Icon } from "../../assets/icons/Icon";
import { studioText as t } from "../../i18n/studio";
import { Button } from "../Button";
import { DisabledHint } from "./DisabledHint";
import { VisibilityIcon, WidgetPreview } from "./Widgets";

export function Stage({
  item,
  name,
  blocked,
  pending,
  onShow,
}: {
  item: OverlayInstance;
  name: string;
  blocked: boolean;
  pending: boolean;
  onShow: () => void;
}) {
  return (
    <section className="v-focus-stage">
      <header>
        <span>
          <Icon name="info" />
          {t.illustrationNote}
        </span>
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
      </header>
      <div
        className="v-focus-drawing"
        role="img"
        aria-label={t.stageLabel(name)}
      >
        <WidgetPreview
          kind={item.kind}
          opacity={item.opacity}
          visible={item.visible}
          locked={item.locked}
          unverified={blocked}
          stage
        />
      </div>
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
