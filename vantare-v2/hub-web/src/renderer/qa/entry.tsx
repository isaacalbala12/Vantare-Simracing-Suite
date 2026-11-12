import { lazy, Suspense } from "react";

declare const __VANTARE_RENDERER_MOCK__: boolean;
const Fixtures = __VANTARE_RENDERER_MOCK__
  ? lazy(() => import("./DialogAuditFixtures"))
  : null;
/** The only audited QA seam in the shell. Production reduces this to null. */
export function RendererQa() {
  return Fixtures &&
    new URLSearchParams(location.search).has("dialog-fixture") ? (
    <Suspense fallback={null}>
      <Fixtures />
    </Suspense>
  ) : null;
}
