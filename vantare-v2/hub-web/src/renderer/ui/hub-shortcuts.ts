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
type Binding = {
  key: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  shift?: boolean;
};
type Action =
  | "commands"
  | "sidebar"
  | "context"
  | "notifications"
  | "launch"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset";
const control = { ctrl: true, alt: false, meta: false, shift: false };
/** GPUI shell/shortcuts.rs and shell/chrome.rs: shell_zoom_key. */
export const hubBindings: readonly (Binding & { action: Action })[] = [
  { ...control, key: hubKeys.commands, action: "commands" },
  { ...control, key: hubKeys.sidebar, action: "sidebar" },
  { ...control, alt: true, key: hubKeys.sidebar, action: "context" },
  {
    ...control,
    shift: true,
    key: hubKeys.notifications,
    action: "notifications",
  },
  { ...control, key: hubKeys.launch, action: "launch" },
  ...zoomKeys.flatMap((key) =>
    [false, true].map((shift) => ({
      ...control,
      key,
      shift,
      action: (key === hubKeys.zoomReset
        ? "zoomReset"
        : key === hubKeys.zoomOut
          ? "zoomOut"
          : "zoomIn") as Action,
    })),
  ),
];
function matches(binding: Binding, event: KeyboardEvent) {
  return (
    binding.key === event.key.toLowerCase() &&
    binding.ctrl === event.ctrlKey &&
    binding.alt === event.altKey &&
    binding.meta === event.metaKey &&
    (binding.shift === undefined || binding.shift === event.shiftKey)
  );
}
export function hubShortcut(event: KeyboardEvent): Action | undefined {
  if (event.repeat || event.isComposing || event.getModifierState("AltGraph"))
    return;
  return hubBindings.find((binding) => matches(binding, event))?.action;
}
export function isZoomAction(action: Action | undefined) {
  return action === "zoomIn" || action === "zoomOut" || action === "zoomReset";
}
// Chromium's built-in print/reload must not act on the document behind a dialog.
const browserKeys = ["p", "r"];
const keys = new Set<string>([
  ...Object.values(hubKeys).flat(),
  ...browserKeys,
]);
// Windows may report Spanish AltGr as Control+Alt without AltGraph. Match
// exact modifier chords and logical keys instead of exempting all Control+Alt.
export const dialogBindings = [...keys].flatMap((key) => [
  { key, ctrl: true, alt: false, meta: false },
  { key, ctrl: true, alt: true, meta: false },
  { key, ctrl: false, alt: false, meta: true },
  { key, ctrl: false, alt: true, meta: true },
]);
export function dialogShortcut(event: KeyboardEvent) {
  if (isZoomAction(hubShortcut(event))) return false;
  if (
    event.key.toLowerCase() === hubKeys.undo &&
    event.target instanceof Element &&
    event.target.closest('input,textarea,[contenteditable="true"]')
  )
    return false;
  return dialogBindings.some((binding) => matches(binding, event));
}
