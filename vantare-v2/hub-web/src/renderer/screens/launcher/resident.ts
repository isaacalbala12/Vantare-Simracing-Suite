import { useEffect, useState } from "react";
import type { ResidentView } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
export function useResident() {
  const { client, issue } = useHost();
  const [view, setView] = useState<ResidentView>();
  useEffect(() => {
    setView(undefined);
    if (!client || issue) return;
    let alive = true,
      received = false;
    const off = client.listen((message) => {
      if (!alive) return;
      if (
        message.kind === "event" &&
        message.event.topic === "launcherResident"
      ) {
        received = true;
        setView(message.event.value);
      }
    });
    const unsubscribe = client.subscribe("launcherResident");
    void client
      .request({ method: "launcher.resident.get" })
      .then((reply) => {
        if (alive && !received && reply.method === "launcher.resident.get")
          setView(reply.value);
      })
      .catch(() => {
        if (alive && !received) setView(undefined);
      });
    return () => {
      alive = false;
      off();
      unsubscribe();
    };
  }, [client, issue]);
  return view;
}
