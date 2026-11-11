import { useCallback, useLayoutEffect, useReducer, useRef } from "react";

function wipe(node: HTMLElement | null) {
  if (node instanceof HTMLInputElement) node.value = "";
  else
    node?.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      input.value = "";
    });
}
/** One local owner; React state contains only a redraw counter. */
export function useSecretInput() {
  const stored = useRef("");
  const element = useRef<HTMLElement | null>(null);
  const [, redraw] = useReducer((revision: number) => revision + 1, 0);
  const set = useCallback((value: string) => {
    stored.current = value;
    if (!value) wipe(element.current);
    redraw();
  }, []);
  const bind = useCallback((node: HTMLElement | null) => {
    if (element.current && element.current !== node) {
      wipe(element.current);
      stored.current = "";
    }
    element.current = node;
  }, []);
  useLayoutEffect(
    () => () => {
      stored.current = "";
      wipe(element.current);
    },
    [],
  );
  return [stored.current, set, bind] as const;
}
