import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { HostError } from "../../../contract/generated/contract";
import { useHost } from "../../app/Host";
import { notices as text } from "../../i18n/notifications";
import { type Center, type Filter, type NoticeInput, publish } from "./center";

const notifiableFailures = [
  "io",
  "unsupported",
  "incompatible",
] as const satisfies readonly HostError["kind"][];

interface State extends Center {
  filter: Filter;
  setFilter: (filter: Filter) => void;
  add: (input: NoticeInput, at?: number, muted?: boolean) => void;
  read: (id?: string) => void;
  clear: () => void;
}
export function createNotifications() {
  return createStore<State>((set) => ({
    filter: "all",
    setFilter: (filter) => set({ filter }),
    records: [],
    sequence: 0,
    add: (input, at = Date.now(), muted = false) =>
      set((state) => publish(state, input, at, muted)),
    read: (id) =>
      set((state) => ({
        records: state.records.map((record) =>
          !id || record.id === id ? { ...record, unread: false } : record,
        ),
      })),
    clear: () => set({ records: [] }),
  }));
}
const Context = createContext<
  ReturnType<typeof createNotifications> | undefined
>(undefined);
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createNotifications);
  const { client } = useHost();
  useEffect(() => {
    const dispose = client?.listen((message) => {
      if (
        message.kind === "response" &&
        message.result.method === "notifications.test"
      )
        store.getState().add({
          source: "system",
          severity: message.result.accepted ? "info" : "warning",
          dedupeKey: "system.test",
          title: text.test,
          text: message.result.accepted ? text.testSent : text.testFailed,
        });
      if (
        message.kind === "failure" &&
        notifiableFailures.some((kind) => kind === message.error.kind)
      )
        store.getState().add({
          source: "system",
          severity: "error",
          dedupeKey: `hub.failure.${message.error.kind}`,
          title: text.localError,
          text: text.failure,
        });
    });
    return () => {
      dispose?.();
    };
  }, [client, store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useNotifications() {
  const store = useContext(Context);
  if (!store) throw Error("Notifications provider missing");
  return useStore(store, (state) => state);
}
