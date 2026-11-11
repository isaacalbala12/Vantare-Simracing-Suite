import type {
  OverlayInstance,
  StudioView,
} from "../../../contract/generated/contract";
import { studioText as t } from "../../i18n/studio";

export { WidgetPreview, WidgetThumb } from "../widgets/WidgetThumb";
export function widgetName(item: OverlayInstance, view: StudioView) {
  const name =
    view.catalog.find((widget) => widget.kind === item.kind)?.name ?? item.kind;
  const same = view.instances.filter((widget) => widget.kind === item.kind);
  return same.length > 1
    ? `${name} ${same.findIndex((widget) => widget.id === item.id) + 1}`
    : name;
}
export function widgetStatus(item: OverlayInstance) {
  const sessions = (["practice", "qualifying", "race"] as const)
    .filter((key) => item.showIn[key])
    .map((key) => t.sessionNames[key]);
  return [
    item.visible ? t.visible : t.hidden,
    item.opacity < 100 ? `${item.opacity} %` : null,
    sessions.length === 3
      ? null
      : sessions.length
        ? t.onlySessions(sessions)
        : t.noSessions,
  ]
    .filter(Boolean)
    .join(" · ");
}
export function VisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.8 8C4 2.7 12 2.7 14.2 8C12 13.3 4 13.3 1.8 8Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      {!visible && (
        <path d="m3 13 10-10" stroke="currentColor" strokeWidth="1.4" />
      )}
      <circle cx="7.9" cy="7.9" r="1.7" fill="currentColor" />
    </svg>
  );
}
