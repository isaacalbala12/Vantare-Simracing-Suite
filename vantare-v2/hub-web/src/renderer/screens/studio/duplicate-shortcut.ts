import { type RefObject, useEffect, useRef } from "react";

/** UI-only preparation for D111. No RPC until the generated host contract exists. */
export function useStudioDuplicateShortcut({
  root,
  enabled,
  duplicate,
}: {
  root: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** The caller owns confirmation/error state; completion alone is not Saved. */
  duplicate?: () => Promise<unknown>;
}) {
  const pending = useRef(false);
  useEffect(() => {
    const node = root.current;
    if (!node || !enabled || !duplicate) return;
    const key = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "d" ||
        event.ctrlKey === event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.getModifierState("AltGraph") ||
        event.repeat ||
        event.isComposing ||
        event.defaultPrevented ||
        !(event.target instanceof Element) ||
        !node.contains(event.target) ||
        event.target.closest(
          'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="menu"],[inert]',
        ) ||
        document.querySelector('[role="dialog"],[role="alertdialog"]')
      )
        return;
      event.preventDefault();
      if (pending.current) return;
      pending.current = true;
      const release = () => {
        pending.current = false;
      };
      // Both branches only release the local keyboard latch. The caller must
      // render its result, including Rejected/Unknown, without optimistic edits.
      void Promise.resolve().then(duplicate).then(release, release);
    };
    node.addEventListener("keydown", key);
    return () => node.removeEventListener("keydown", key);
  }, [root, enabled, duplicate]);
}
