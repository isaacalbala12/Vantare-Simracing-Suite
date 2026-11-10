import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import hello from "../../fixtures/ajustes-base.json";
import { es } from "./i18n/es";
import "./design/base.css";

declare global {
  interface Window {
    vantare?: { platform: string; connect(): Promise<void> };
  }
}
function App() {
  const [status, setStatus] = useState<string>(es.loading);
  useEffect(() => {
    if (!window.vantare) {
      setStatus(es.mock);
      return;
    }
    let port: MessagePort | undefined;
    const receive = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.data !== "vantare:port" ||
        !event.ports[0]
      )
        return;
      port = event.ports[0];
      port.onmessage = ({ data }) => {
        if (data?.kind === "hello")
          setStatus(data.version === hello.version ? es.mock : es.incompatible);
      };
      port.start();
      port.postMessage({ kind: "hello", version: 1 });
    };
    window.addEventListener("message", receive);
    void window.vantare.connect().catch(() => setStatus(es.unavailable));
    return () => {
      window.removeEventListener("message", receive);
      port?.close();
    };
  }, []);
  return (
    <>
      <header>{es.title}</header>
      <main>
        <h1>{es.settings}</h1>
        <p role="status">{status}</p>
      </main>
    </>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(<App />);
