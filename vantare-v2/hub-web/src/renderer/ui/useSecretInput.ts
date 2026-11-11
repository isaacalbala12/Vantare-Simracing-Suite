import { useCallback, useLayoutEffect, useReducer, useRef } from "react";
/** Secret text has one local owner; React state holds only a redraw counter. */
export function useSecretInput() {
  const stored = useRef("");
  const [, redraw] = useReducer((revision: number) => revision + 1, 0);
  const set = useCallback((value: string) => {
    stored.current = value;
    redraw();
  }, []);
  useLayoutEffect(
    () => () => {
      stored.current = "";
    },
    [],
  );
  return [stored.current, set] as const;
}
