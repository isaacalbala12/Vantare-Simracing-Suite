import { useMemo } from "react";
import { useLicense } from "./license";
import { buildAccessContext } from "./access-policy";
import type { AccessContext, AccessRole } from "./access-policy";

export function useAccess(options?: { roles?: AccessRole[] }): AccessContext {
  const { result } = useLicense();

  return useMemo(() => {
    const roles = options?.roles ?? [];

    if (!result) {
      return {
        planLabel: "free",
        planStatus: "free",
        roles,
        isBlocked: false,
        isUnconfigured: false,
      };
    }
    return buildAccessContext({ license: result, roles });
  }, [result, options?.roles]);
}
