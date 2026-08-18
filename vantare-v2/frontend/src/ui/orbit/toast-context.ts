import { createContext, useContext } from "react";

export interface ToastApi {
  show(title: string, message?: string): void;
}

export interface ToastEntry {
  id: number;
  title: string;
  message?: string;
}

/** `04 · toast`: máximo 3 visibles, auto-cierre a 2.6 s. */
export const TOAST_MAX = 3;
export const TOAST_TTL_MS = 2600;

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast necesita un <ToastProvider> por encima.");
  return api;
}
