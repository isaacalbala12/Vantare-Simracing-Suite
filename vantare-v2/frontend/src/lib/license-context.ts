import { createContext, useContext } from "react";
import type { LicenseResult } from "./license-types";

export type LicenseContextValue = {
  result: LicenseResult | null;
  loading: boolean;
  refresh: () => void;
  clearLicense: () => void;
};

export const LicenseContext = createContext<LicenseContextValue | null>(null);

export function useLicense(): LicenseContextValue {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error("useLicense must be used inside LicenseProvider");
  }
  return context;
}
