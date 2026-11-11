import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  AccountRequest,
  AccountView,
} from "../../contract/generated/account";
import type { Reply } from "../../contract/generated/contract";
import {
  isAccount,
  isRequest as isAccountRequest,
} from "../../contract/modules/account";
import { discardAccountSecrets } from "../bridge/account-secrets";
import { HostFailure } from "../bridge/client";
import { accessText as text } from "../i18n/access.es";
import { useHost } from "./Host";

interface AccountState {
  value?: AccountView;
  pending: boolean;
  error?: string;
  act: (request: AccountRequest, onSent?: () => void) => Promise<void>;
  reload: () => void;
}
const Context = createContext<AccountState | undefined>(undefined);
export function useOptionalAccount() {
  return useContext(Context);
}
export function useAccount() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing AccountProvider");
  return value;
}
export function AccountProvider({ children }: { children: ReactNode }) {
  const { client } = useHost();
  const [value, setValue] = useState<AccountView>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef(true);
  const running = useRef(0);
  const sequence = useRef(0);
  const intents = useRef(new Set<string>());
  const act = useCallback(
    async (request: AccountRequest, onSent?: () => void) => {
      const method = request.method;
      const secretKind =
        request.method !== "account.email"
          ? undefined
          : request.action.action === "verify"
            ? "code"
            : request.action.action === "reset" ||
                (request.action.action === "begin" &&
                  request.action.password.length > 0)
              ? "password"
              : undefined;
      let sent = false;
      const priority =
        request.method === "account.cancel" ||
        request.method === "account.logout" ||
        (request.method === "account.email" &&
          request.action.action === "cancel");
      if (!client) {
        discardAccountSecrets(request);
        return;
      }
      if (!isAccountRequest(request)) {
        discardAccountSecrets(request);
        setError(text.failed);
        return;
      }
      const key =
        request.method === "account.email"
          ? `${request.method}:${request.action.action}`
          : request.method;
      if (intents.current.has(key)) {
        discardAccountSecrets(request);
        return;
      }
      if (running.current && !priority) {
        discardAccountSecrets(request);
        setError(text.busy);
        return;
      }
      const current = ++sequence.current;
      intents.current.add(key);
      running.current++;
      setPending(true);
      setError(undefined);
      try {
        let response: Promise<Reply>;
        try {
          response = client.request(request, () => {
            sent = true;
            discardAccountSecrets(request);
            onSent?.();
          });
        } finally {
          discardAccountSecrets(request);
        }
        const reply = await response;
        if (
          reply.method !== method ||
          !("value" in reply) ||
          !isAccount(reply.value)
        )
          throw new HostFailure({ kind: "denied" });
        if (active.current && sequence.current === current)
          setValue(reply.value);
      } catch (failure) {
        if (active.current && sequence.current === current)
          setError(
            failure instanceof HostFailure && failure.detail.kind === "busy"
              ? sent && secretKind
                ? secretKind === "password"
                  ? text.reenterPassword
                  : text.reenterCode
                : text.busy
              : method === "account.logout"
                ? text.logoutFailed
                : text.failed,
          );
      } finally {
        intents.current.delete(key);
        running.current--;
        if (active.current) setPending(running.current > 0);
      }
    },
    [client],
  );
  useEffect(() => {
    active.current = true;
    if (!client) return;
    let current = true;
    const initialSequence = sequence.current;
    const unlisten = client.listen((message) => {
      if (
        current &&
        message.kind === "event" &&
        message.event.topic === "account"
      )
        setValue(message.event.value);
    });
    const unsubscribe = client.subscribe("account");
    void client
      .request({ method: "account.get" })
      .then((reply) => {
        if (!current || sequence.current !== initialSequence) return;
        if (reply.method !== "account.get")
          throw new HostFailure({ kind: "denied" });
        setValue(reply.value);
      })
      .catch(() => {
        if (current && sequence.current === initialSequence)
          setError(text.failed);
      });
    return () => {
      current = false;
      active.current = false;
      sequence.current++;
      unlisten();
      unsubscribe();
    };
  }, [client]);
  const state = {
    value,
    pending: pending || !!value?.working,
    error,
    act,
    reload: () => {
      void act({ method: "account.get" });
    },
  };
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
