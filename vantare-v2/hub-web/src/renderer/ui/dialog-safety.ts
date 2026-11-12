type Entry = { node: HTMLElement; close: () => void };
const controls = ".v-window-controls";
const floating = ".v-positioner";
const focusable =
  'button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),textarea:not(:disabled),select:not(:disabled),[tabindex]';

/** One registry per React provider/window. Never makes the titlebar inert. */
export function dialogSafety(doc: Document) {
  const entries: Entry[] = [];
  const previous = new Map<HTMLElement, boolean>();
  const oldFloating = new Set<HTMLElement>();
  const top = () => entries.at(-1);
  const usable = (node: HTMLElement) =>
    !node.closest('[inert],[hidden],[aria-hidden="true"]') &&
    getComputedStyle(node).display !== "none" &&
    getComputedStyle(node).visibility !== "hidden";
  const portals = () =>
    [...doc.querySelectorAll<HTMLElement>(floating)].filter(
      (node) => !oldFloating.has(node) && usable(node),
    );
  const allowed = (node: Element) =>
    !!top()?.node.contains(node) ||
    (!!node.closest(controls) && !node.closest("[inert]")) ||
    portals().some((portal) => portal.contains(node));
  function refresh() {
    const targets = new Set<HTMLElement>();
    if (top()) {
      for (const node of doc.querySelectorAll<HTMLElement>(
        ".v-shell-body,.v-sidebar",
      ))
        if (!node.contains(top()?.node ?? null)) targets.add(node);
      for (const entry of entries.slice(0, -1)) targets.add(entry.node);
      for (const node of oldFloating) targets.add(node);
    }
    for (const [node, inert] of previous)
      if (!targets.has(node)) {
        node.inert = inert;
        node.toggleAttribute("inert", inert);
        previous.delete(node);
      }
    for (const node of targets) {
      if (!previous.has(node)) previous.set(node, node.hasAttribute("inert"));
      node.inert = true;
      node.setAttribute("inert", "");
    }
  }
  function targets() {
    const roots = [
      ...doc.querySelectorAll<HTMLElement>(controls),
      top()?.node,
      ...portals(),
    ].filter((node): node is HTMLElement => !!node && usable(node));
    return [
      ...new Set(
        roots.flatMap((root) => [
          ...root.querySelectorAll<HTMLElement>(focusable),
        ]),
      ),
    ].filter((node) => node.tabIndex >= 0 && usable(node));
  }
  function focus() {
    (targets()[0] ?? top()?.node)?.focus({ preventScroll: true });
  }
  function key(event: KeyboardEvent) {
    const active = top();
    if (!active) return;
    if (event.key === "Tab") {
      const nodes = targets(),
        index = nodes.indexOf(doc.activeElement as HTMLElement);
      const next =
        index < 0
          ? event.shiftKey
            ? nodes.length - 1
            : 0
          : (index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length;
      (nodes[next] ?? active.node).focus({ preventScroll: true });
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.key === "Escape") {
      if (
        portals().some((node) =>
          node.querySelector('[role="menu"],[role="listbox"]'),
        )
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      active.close();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      ![
        "a",
        "c",
        "v",
        "x",
        "z",
        "y",
        "home",
        "end",
        "arrowleft",
        "arrowright",
        "arrowup",
        "arrowdown",
        "backspace",
        "delete",
      ].includes(event.key.toLowerCase())
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  function focusIn(event: FocusEvent) {
    if (top() && event.target instanceof Element && !allowed(event.target))
      focus();
  }
  function pointer(event: MouseEvent) {
    if (!top() || !(event.target instanceof Element) || allowed(event.target))
      return;
    // Keep native drag regions alone; block interactive actions behind the dialog.
    if (event.target.closest('button,a,input,[role="tab"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  function escapeBubble(event: KeyboardEvent) {
    if (top() && event.key === "Escape") event.stopPropagation();
  }
  return {
    register(entry: Entry) {
      if (!entries.length)
        for (const node of doc.querySelectorAll<HTMLElement>(floating))
          oldFloating.add(node);
      entries.push(entry);
      refresh();
      return () => {
        const index = entries.indexOf(entry);
        if (index >= 0) entries.splice(index, 1);
        refresh();
        if (!entries.length) oldFloating.clear();
      };
    },
    listen() {
      doc.defaultView?.addEventListener("keydown", key, true);
      doc.addEventListener("keydown", escapeBubble);
      doc.addEventListener("focusin", focusIn, true);
      doc.addEventListener("pointerdown", pointer, true);
      doc.addEventListener("click", pointer, true);
      return () => {
        doc.defaultView?.removeEventListener("keydown", key, true);
        doc.removeEventListener("keydown", escapeBubble);
        doc.removeEventListener("focusin", focusIn, true);
        doc.removeEventListener("pointerdown", pointer, true);
        doc.removeEventListener("click", pointer, true);
        entries.length = 0;
        refresh();
        oldFloating.clear();
      };
    },
  };
}
