import type {
  StudioView,
  WidgetInfo,
} from "../../../contract/generated/studio";
import {
  studioAddAvailable,
  studioLimits,
} from "../../../contract/generated/studio";

const fold = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").trim();

/** Preserve the existing catalogue order and permission groups from the host. */
export function catalogGroups(
  view: StudioView,
  search: string,
  category: string,
) {
  const widgets = view.catalog.filter(
    (widget) =>
      (!category || category === widget.category) &&
      fold(`${widget.name} ${widget.about}`).includes(fold(search)),
  );
  const suggested = widgets.filter(
    (widget) =>
      widget.allowed &&
      widget.suggested &&
      !view.instances.some((item) => item.kind === widget.kind),
  );
  return [
    { id: "suggested", items: suggested },
    {
      id: "allowed",
      items: widgets.filter(
        (widget) => widget.allowed && !suggested.includes(widget),
      ),
    },
    { id: "locked", items: widgets.filter((widget) => !widget.allowed) },
  ] as const;
}

export function catalogBlock(
  view: StudioView,
  widget: WidgetInfo,
  pending: boolean,
) {
  if (view.state !== "ready") return "protected";
  if (pending) return "pending";
  if (view.instances.length >= studioLimits.instances) return "limit";
  if (!studioAddAvailable) return "unavailable";
  if (!widget.allowed) return view.plan === "unverified" ? "unverified" : "pro";
  return undefined;
}
