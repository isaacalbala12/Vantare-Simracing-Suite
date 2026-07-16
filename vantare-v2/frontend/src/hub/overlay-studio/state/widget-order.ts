import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";

function sortByZIndex(widgets: readonly WidgetInstanceV3[]): WidgetInstanceV3[] {
  return [...widgets].sort((left, right) => left.layout.zIndex - right.layout.zIndex);
}

function assignZIndexFromOrder(widgets: readonly WidgetInstanceV3[]): WidgetInstanceV3[] {
  return widgets.map((widget, index) => ({
    ...widget,
    layout: {
      ...widget.layout,
      zIndex: index,
    },
  }));
}

export function normalizeWidgetOrder(widgets: readonly WidgetInstanceV3[]): WidgetInstanceV3[] {
  return assignZIndexFromOrder(sortByZIndex(widgets));
}

function partitionWidgets(widgets: readonly WidgetInstanceV3[], widgetIds: ReadonlySet<string>) {
  const sorted = sortByZIndex(widgets);
  const targeted: WidgetInstanceV3[] = [];
  const others: WidgetInstanceV3[] = [];
  for (const widget of sorted) {
    if (widgetIds.has(widget.id)) {
      targeted.push(widget);
    } else {
      others.push(widget);
    }
  }
  return { sorted, targeted, others };
}

function bringToFront(sorted: WidgetInstanceV3[], widgetIds: ReadonlySet<string>): WidgetInstanceV3[] {
  const result = [...sorted];
  const targetedIds = result
    .map((widget, index) => ({ id: widget.id, index }))
    .filter((entry) => widgetIds.has(entry.id))
    .sort((left, right) => right.index - left.index)
    .map((entry) => entry.id);

  for (const id of targetedIds) {
    let index = result.findIndex((widget) => widget.id === id);
    while (index < result.length - 1 && !widgetIds.has(result[index + 1].id)) {
      const next = result[index + 1];
      result[index + 1] = result[index];
      result[index] = next;
      index += 1;
    }
  }
  return result;
}

function moveBlockForward(sorted: WidgetInstanceV3[], widgetIds: ReadonlySet<string>): WidgetInstanceV3[] {
  const indices = sorted
    .map((widget, index) => (widgetIds.has(widget.id) ? index : -1))
    .filter((index) => index >= 0);
  if (indices.length === 0) {
    return sorted;
  }
  const first = indices[0];
  const last = indices[indices.length - 1];
  if (last >= sorted.length - 1) {
    return sorted;
  }
  const before = sorted.slice(0, first);
  const block = sorted.slice(first, last + 1);
  const after = sorted.slice(last + 1);
  const [swap, ...restAfter] = after;
  return [...before, swap, ...block, ...restAfter];
}

function moveBlockBackward(sorted: WidgetInstanceV3[], widgetIds: ReadonlySet<string>): WidgetInstanceV3[] {
  const indices = sorted
    .map((widget, index) => (widgetIds.has(widget.id) ? index : -1))
    .filter((index) => index >= 0);
  if (indices.length === 0) {
    return sorted;
  }
  const first = indices[0];
  const last = indices[indices.length - 1];
  if (first <= 0) {
    return sorted;
  }
  const before = sorted.slice(0, first - 1);
  const swap = sorted[first - 1];
  const block = sorted.slice(first, last + 1);
  const after = sorted.slice(last + 1);
  return [...before, ...block, swap, ...after];
}

export function reorderWidgets(
  widgets: readonly WidgetInstanceV3[],
  widgetIds: readonly string[],
  direction: "front" | "forward" | "backward" | "back",
): WidgetInstanceV3[] {
  const idSet = new Set(widgetIds);
  const { sorted, targeted, others } = partitionWidgets(widgets, idSet);
  if (targeted.length === 0) {
    return normalizeWidgetOrder(widgets);
  }

  let next: WidgetInstanceV3[];
  switch (direction) {
    case "front":
      next = bringToFront(sorted, idSet);
      break;
    case "back":
      next = [...targeted, ...others];
      break;
    case "forward":
      next = moveBlockForward(sorted, idSet);
      break;
    case "backward":
      next = moveBlockBackward(sorted, idSet);
      break;
  }
  return assignZIndexFromOrder(next);
}