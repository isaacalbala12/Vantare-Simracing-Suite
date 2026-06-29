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
    let cancelled = false;

    const unsubChanged = Events.On(
      "license:changed",
      (event: unknown) => {
        if (cancelled) return;
        const data = (event as { data?: LicenseResult | null })?.data ?? null;
        // Never regress from an authenticated state to anonymous. This
        // prevents the LicenseBridge/initial-mount empty-token refresh from
        // overwriting a successful OAuth callback result. Once the user is
        // authenticated (active, grace, authenticated-no-entitlement,
        // expired, device-limit or unconfigured), an anonymous event is
        // treated as stale and ignored.
        setResult((prev) => {
          if (
            prev &&
            prev.state !== "anonymous" &&
            data?.state === "anonymous"
          ) {
            return prev;
          }
          return data;
        });
        setLoading(false);
      },
    );
    const unsubError = Events.On(
      "license:error",
      () => {
        if (!cancelled) setLoading(false);
      },
    );
    refresh();

    // Safety timeout: prevent infinite loading if the Wails IPC bridge
    // wasn't ready or the backend never responded. Resolves to anonymous
    // state (LoginScreen) with one automatic retry.
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
      refresh();
    }, 8000);

    return () => {
      cancelled = true;
      unsubChanged?.();
      unsubError?.();
      clearTimeout(timeoutId);
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
