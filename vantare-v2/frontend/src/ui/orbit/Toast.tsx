import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ToastContext, TOAST_MAX, TOAST_TTL_MS, type ToastApi, type ToastEntry } from "./toast-context";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef<number[]>([]);
  const seq = useRef(0);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    },
    [],
  );

  const show = useCallback((title: string, message?: string) => {
    seq.current += 1;
    const id = seq.current;
    setToasts((current) => [...current, { id, title, message }].slice(-TOAST_MAX));
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, TOAST_TTL_MS);
    timers.current.push(timer);
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastRegion toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function ToastRegion({ toasts }: { toasts: ToastEntry[] }) {
  return (
    <div aria-live="polite" className="orbit-toast-region" data-testid="orbit-toasts" role="status">
      {toasts.map((item) => (
        <div className="orbit-toast" key={item.id}>
          <b>{item.title}</b>
          {item.message ? <span>{item.message}</span> : null}
        </div>
      ))}
    </div>
  );
}
