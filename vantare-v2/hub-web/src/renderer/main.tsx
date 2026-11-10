import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CoreStatus } from "../contract/generated/contract";
import { HOST_PROTOCOL_VERSION } from "../contract/generated/contract";
import { Client } from "./bridge/client";
import { es } from "./i18n/es";
import "./design/base.css";
import "./ui/ui.css";
import { CSPProvider } from "@base-ui/react/csp-provider";

const Specimen = lazy(() =>
  import("./app/Specimen").then((module) => ({ default: module.Specimen })),
);

import { specimen } from "./i18n/es";
import { ToastProvider, ToastViewport, TooltipProvider } from "./ui/Layers";

declare global {
  interface Window {
    vantare?: { platform: string; connect(): Promise<void> };
  }
}
function App() {
  const [status, setStatus] = useState<string>(es.loading);
  useEffect(() => {
    let active = true;
    let client: Client | undefined;
    let unsubscribe: (() => void) | undefined;
    function coreStatus(value: CoreStatus) {
      setStatus(
        value.photos === "connected"
          ? es.coreConnected
          : value.photos === "incompatible"
            ? es.incompatible
            : es.coreUnavailable,
      );
    }
    void Client.connect()
      .then((connection) => {
        if (!active) {
          connection.close();
          return;
        }
        client = connection;
        connection.listen((message) => {
          if (message.kind === "hello") {
            if (message.version !== HOST_PROTOCOL_VERSION) {
              setStatus(es.incompatible);
              return;
            }
            setStatus(message.demo ? es.mock : es.coreUnavailable);
            if (!message.demo) unsubscribe = connection.subscribe("core");
          }
          if (message.kind === "event" && message.event.topic === "core")
            coreStatus(message.event.value);
          if (message.kind === "failure") setStatus(es.coreUnavailable);
        });
        connection.start();
      })
      .catch(() => {
        if (active) setStatus(es.unavailable);
      });
    return () => {
      active = false;
      unsubscribe?.();
      client?.close();
    };
  }, []);

  return (
    <>
      <header className="v-app-header">{es.title}</header>
      <main>
        {new URLSearchParams(location.search).get("escena") === "specimen" ? (
          <Suspense fallback={<p role="status">{es.loading}</p>}>
            <Specimen />
          </Suspense>
        ) : (
          <h1>{es.settings}</h1>
        )}
        <p role="status">{status}</p>
      </main>
    </>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(
  <CSPProvider disableStyleElements>
    <TooltipProvider delay={400}>
      <ToastProvider>
        <App />
        <ToastViewport closeLabel={specimen.close} />
      </ToastProvider>
    </TooltipProvider>
  </CSPProvider>,
);
