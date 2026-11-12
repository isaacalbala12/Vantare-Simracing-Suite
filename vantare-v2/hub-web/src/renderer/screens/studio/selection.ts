import type { OverlayInstance } from "../../../contract/generated/contract";

/** Session memory only: it never becomes part of layout.json or a request. */
export function initialStudioSelection(
  view: { instances: readonly Pick<OverlayInstance, "id" | "visible">[] },
  remembered: string | null,
) {
  return (
    view.instances.find((item) => item.id === remembered)?.id ??
    view.instances.find((item) => item.visible)?.id ??
    view.instances[0]?.id ??
    null
  );
}
