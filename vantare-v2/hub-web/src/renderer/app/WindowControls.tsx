import { useEffect, useState } from "react";
import { windowText } from "../i18n/window.es";
import { useToastManager } from "../ui/Layers";
import { WindowButtons } from "../ui/WindowButtons";
import { useHost } from "./Host";

export function WindowControls() {
  const { client } = useHost();
  const toast = useToastManager();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!client) return;
    const unlisten = client.listen((message) => {
      if (message.kind === "event" && message.event.topic === "windowState")
        setMaximized(message.event.maximized);
    });
    const unsubscribe = client.subscribe("windowState");
    return () => {
      unsubscribe();
      unlisten();
    };
  }, [client]);
  async function act(method: "window.minimize" | "window.toggleMaximize") {
    try {
      const reply = await client?.request({ method });
      if (reply?.method !== method || !reply.accepted)
        throw new Error("Window action unavailable");
    } catch {
      toast.add({ title: windowText.failed, type: "err" });
    }
  }
  return (
    <WindowButtons
      maximized={maximized}
      disabled={!client}
      labels={windowText}
      minimize={() => void act("window.minimize")}
      maximize={() => void act("window.toggleMaximize")}
      close={() => client?.closeWindow()}
    />
  );
}
