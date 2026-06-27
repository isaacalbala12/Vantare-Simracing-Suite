import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Events } from "@wailsio/runtime";
import type { LicenseResult } from "./license-types";

type LicenseContextValue = {
  result: LicenseResult | null;
  loading: boolean;
  refresh: () => void;
};

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<LicenseResult | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    Events.Emit("license:validate", {});
  }, []);

  useEffect(() => {
    const unsubChanged = Events.On(
      "license:changed",
      (event: unknown) => {
        const data = (event as { data?: LicenseResult | null })?.data ?? null;
        setResult(data);
        setLoading(false);
      },
    );
    const unsubError = Events.On(
      "license:error",
      () => {
        setLoading(false);
      },
    );
    refresh();
    return () => {
      unsubChanged?.();
      unsubError?.();
    };
  }, [refresh]);

  const value = useMemo<LicenseContextValue>(
    () => ({ result, loading, refresh }),
    [result, loading, refresh],
  );

  return (
    <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLicense(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) {
    throw new Error("useLicense must be used inside LicenseProvider");
  }
  return ctx;
}
