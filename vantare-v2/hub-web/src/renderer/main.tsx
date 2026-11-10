import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import { HostProvider, useHost } from "./app/Host";
import { PilotProvider } from "./app/PilotState";
import { SettingsProvider } from "./app/SettingsState";
import { Shell } from "./app/Shell";
import { UiProvider } from "./app/UiState";
import { es, specimen } from "./i18n/es";
import { Callout, Skeleton } from "./ui/Data";
import { ToastProvider, ToastViewport, TooltipProvider } from "./ui/Layers";
import { ContentStack } from "./ui/ShellLayout";
import "./design/base.css";
import "./ui/ui.css";

const Specimen = lazy(() =>
  import("./app/Specimen").then((module) => ({ default: module.Specimen })),
);
declare global {
  interface Window {
    vantare?: { platform: string; connect(): Promise<void> };
  }
}
function Content() {
  const host = useHost();
  if (host.issue) return <Callout title={host.issue} tone="err" />;
  if (!host.hello) return null;
  if (new URLSearchParams(location.search).get("escena") === "specimen")
    return (
      <ContentStack>
        <Suspense fallback={<Skeleton label={es.loading} />}>
          <Specimen />
        </Suspense>
        <Callout title={host.hello.demo ? es.mock : es.coreUnavailable} />
        <ToastViewport closeLabel={specimen.close} />
      </ContentStack>
    );
  return (
    <SettingsProvider>
      <PilotProvider>
        <Shell />
      </PilotProvider>
    </SettingsProvider>
  );
}
function App() {
  const [cache] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Infinity,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={cache}>
      <HostProvider>
        <UiProvider>
          <CSPProvider disableStyleElements>
            <TooltipProvider delay={400}>
              <ToastProvider>
                <Content />
              </ToastProvider>
            </TooltipProvider>
          </CSPProvider>
        </UiProvider>
      </HostProvider>
    </QueryClientProvider>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(<App />);
