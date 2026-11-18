import { lazy, type ReactNode, Suspense } from "react";
import { useHost } from "../app/Host";

declare const __VANTARE_RENDERER_MOCK__: boolean;
const Strategy = __VANTARE_RENDERER_MOCK__
  ? lazy(() => import("./StrategyFixture"))
  : null;

export function StrategyEntry({ fallback }: { fallback: ReactNode }) {
  const { client, hello } = useHost();
  if (
    !Strategy ||
    !client ||
    !hello?.demo ||
    !new URLSearchParams(location.search).get("escena")?.startsWith("strategy-")
  )
    return fallback;

  return (
    <Suspense fallback={fallback}>
      <Strategy client={client} />
    </Suspense>
  );
}
