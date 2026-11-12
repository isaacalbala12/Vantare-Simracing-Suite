/** Shared by the actual registrations and partial-window modality. */
export const hubKeys = {
  commands: "k",
  sidebar: "b",
  notifications: "n",
  launch: "l",
  save: "s",
  zoomIn: ["+", "="],
  zoomOut: "-",
  zoomReset: "0",
  undo: "z",
} as const;
export const zoomKeys: readonly string[] = [
  ...hubKeys.zoomIn,
  hubKeys.zoomOut,
  hubKeys.zoomReset,
];
// Chromium's built-in print/reload must not act on the document behind a dialog.
const browserKeys = ["p", "r"];
const keys = new Set<string>([
  ...Object.values(hubKeys).flat(),
  ...browserKeys,
]);
export function altGraph(event: KeyboardEvent) {
  return event.getModifierState("AltGraph") || (event.ctrlKey && event.altKey);
}
export function dialogShortcut(event: KeyboardEvent) {
  if (altGraph(event) || !(event.ctrlKey || event.metaKey)) return false;
  if (
    event.key.toLowerCase() === hubKeys.undo &&
    event.target instanceof Element &&
    event.target.closest('input,textarea,[contenteditable="true"]')
  )
    return false;
  return keys.has(event.key.toLowerCase());
}
