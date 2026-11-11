import type { KeyboardEvent, ReactNode } from "react";
import "./gate.css";

function cyclePrivacyFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (
    event.defaultPrevented ||
    event.key !== "Tab" ||
    !event.currentTarget.querySelector(".v-privacy-question")
  )
    return;
  const targets = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      ".v-gate-titlebar button, [data-privacy-focus]",
    ),
  ).filter(
    (node) =>
      !node.hasAttribute("disabled") &&
      (node.matches("[data-privacy-focus]") || node.tabIndex >= 0),
  );
  if (!targets.length) return;
  const current = targets.indexOf(document.activeElement as HTMLElement);
  const next =
    current < 0
      ? event.shiftKey
        ? targets.length - 1
        : 0
      : (current + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
  targets[next]?.focus();
  event.preventDefault();
}
export function GateFrame({
  controls,
  children,
}: {
  controls: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="v-gate" onKeyDownCapture={cyclePrivacyFocus}>
      <div className="v-gate-titlebar">{controls}</div>
      <main className="v-gate-content">{children}</main>
    </div>
  );
}
