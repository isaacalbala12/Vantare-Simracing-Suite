import { Menu } from "@base-ui/react/menu";
import { useId } from "react";
import type {
  OverlayInstance,
  StudioView,
} from "../../../contract/generated/studio";
import { studioText as t } from "../../i18n/studio";
import { studioCatalogText as text } from "../../i18n/studio-catalog";
import { Button } from "../Button";
import { MoreActionIcon } from "./MoreActionIcon";
import { widgetName } from "./Widgets";
import "./studio-catalog.css";

export function MoreMenu({
  item,
  view,
  pending,
  onRemove,
}: {
  item: OverlayInstance;
  view: StudioView;
  pending: boolean;
  onRemove: () => void;
}) {
  const id = useId();
  const reason =
    view.state !== "ready"
      ? text.catalogProtected
      : view.plan === "unverified"
        ? t.verifyWidget
        : item.locked
          ? t.lockedWidget
          : pending
            ? t.saving
            : undefined;
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger render={<Button />} aria-label={text.moreLabel}>
        <span aria-hidden="true">{text.moreMark}</span>
        {text.more}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="v-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
        >
          <Menu.Popup className="v-popup v-studio-more">
            <Menu.Item
              className="v-option v-studio-more-item"
              disabled
              aria-describedby={`${id}-edit`}
            >
              <MoreActionIcon action="place" />
              <span>
                <strong>
                  {t.edit}
                  <span className="v-studio-more-soon">{text.moreSoon}</span>
                </strong>
                <small id={`${id}-edit`}>{text.moreEditHelp}</small>
              </span>
            </Menu.Item>
            <Menu.Item
              className="v-option v-studio-more-item"
              disabled
              aria-describedby={`${id}-obs`}
            >
              <MoreActionIcon action="obs" />
              <span>
                <strong>
                  {t.obs}
                  <span className="v-studio-more-soon">{text.moreSoon}</span>
                </strong>
                <small id={`${id}-obs`}>{text.moreObsHelp}</small>
              </span>
            </Menu.Item>
            <Menu.Separator className="v-studio-more-separator" />
            <Menu.Item
              className="v-option v-studio-more-item v-studio-more-remove"
              disabled={!!reason}
              aria-describedby={`${id}-remove`}
              onClick={() => {
                if (!reason) onRemove();
              }}
            >
              <MoreActionIcon action="remove" />
              <span>
                <strong>{text.moreRemove(widgetName(item, view))}</strong>
                <small id={`${id}-remove`}>
                  {reason ?? text.moreRemoveHelp}
                </small>
              </span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
