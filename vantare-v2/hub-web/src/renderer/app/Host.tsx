import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import coreFixture from "../../../fixtures/core-offline.json";
import {
  type CoreStatus,
  HOST_PROTOCOL_VERSION,
  type HostToUi,
} from "../../contract/generated/contract";
import { Client } from "../bridge/client";
import { es } from "../i18n/es";
export const coreKey = ["core"] as const;
export const homePhotosKey = ["home", "photos"] as const;
export const settingsKey = ["settings"] as const;
export const offline = coreFixture as CoreStatus;
type Hello = Extract<HostToUi, { kind: "hello" }>;
interface Host {
  client?: Client;
  hello?: Hello;
  issue?: string;
}
const Context = createContext<Host>({});
export const useHost = () => useContext(Context);
export function HostProvider({ children }: { children: ReactNode }) {
  const query = useQueryClient();
  const [host, setHost] = useState<Host>({});
  useEffect(() => {
    let active = true;
    let client: Client | undefined;
    const disposers: (() => void)[] = [];
    query.setQueryData(coreKey, offline);
    void Client.connect()
      .then((connection) => {
        if (!active) {
          connection.close();
          return;
        }
        client = connection;
        disposers.push(
          connection.listen((message) => {
            if (message.kind === "hello") {
              document.documentElement.dataset.palette = message.theme.palette;
              document.documentElement.dataset.scheme =
                message.theme.scheme === "system"
                  ? matchMedia("(prefers-color-scheme: dark)").matches
                    ? "dark"
                    : "light"
                  : message.theme.scheme;
              if (message.version !== HOST_PROTOCOL_VERSION) {
                setHost({ client: connection, issue: es.incompatible });
                return;
              }
              setHost({ client: connection, hello: message });
              disposers.push(connection.subscribe("core"));
            }
            if (message.kind === "event" && message.event.topic === "core") {
              const next = message.event.value;
              const previous = query.getQueryData<CoreStatus>(coreKey);
              if (
                next.accountGeneration !== previous?.accountGeneration ||
                next.live ||
                next.rights !== "connected" ||
                !next.access.verified ||
                next.access.blocked
              )
                query.removeQueries({ queryKey: homePhotosKey, exact: true });
              query.setQueryData(coreKey, next);
            }
            if (message.kind === "failure" && message.id === 0) {
              query.removeQueries({ queryKey: homePhotosKey, exact: true });
              setHost((previous) => ({
                ...previous,
                client,
                issue: es.unavailable,
              }));
            }
          }),
        );
        connection.start();
      })
      .catch(() => {
        if (active) {
          document.documentElement.dataset.palette = "vantare";
          document.documentElement.dataset.scheme = "dark";
          setHost((previous) => ({
            ...previous,
            client,
            issue: es.unavailable,
          }));
        }
      });
    return () => {
      active = false;
      query.removeQueries({ queryKey: homePhotosKey, exact: true });
      for (const dispose of disposers) dispose();
      client?.close();
    };
  }, [query]);
  return <Context.Provider value={host}>{children}</Context.Provider>;
}
