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
import { AccountSessionContext, createAccountSession } from "./AccountSession";
import { useHost } from "./Host";

interface AccountState {
  value?: AccountView;
  pending: boolean;
  pendingMethod?: AccountRequest["method"];
  error?: string;
  act: (request: AccountRequest, onSent?: () => void) => Promise<void>;
  reload: () => void;
}
const Context = createContext<AccountState | undefined>(undefined);
export function useAccount() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing AccountProvider");
  return value;
}
export function AccountProvider({ children }: { children: ReactNode }) {
  const { client } = useHost();
  const [session] = useState(createAccountSession);
  const [value, setValue] = useState<AccountView>();
  const [pending, setPending] = useState(false);
  const [pendingMethod, setPendingMethod] =
    useState<AccountRequest["method"]>();
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
      const transition = [
        "account.begin",
        "account.logout",
        "account.email",
        "account.cancel",
        "account.choose",
        "account.back",
        "account.retry",
        "account.deviceReset",
      ].includes(method);
      if (transition) session.invalidate();
      const current = ++sequence.current;
      intents.current.add(key);
      running.current++;
      setPending(true);
      setPendingMethod(method);
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
        if (active.current && sequence.current === current) {
          session.confirm(reply.value);
          setValue(reply.value);
        }
      } catch (failure) {
        if (active.current && sequence.current === current) {
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
          if (transition) {
            // A rejected intent does not prove logout. Re-read the host once;
            // never restore an old cached identity after a newer publication.
            try {
              const fresh = await client.request({ method: "account.get" });
              if (
                active.current &&
                sequence.current === current &&
                fresh.method === "account.get" &&
                isAccount(fresh.value)
              ) {
                session.confirm(fresh.value);
                setValue(fresh.value);
              }
            } catch {
              /* Keep the session unavailable until it can be confirmed. */
            }
          }
        }
      } finally {
        intents.current.delete(key);
        running.current--;
        if (active.current) {
          setPending(running.current > 0);
          if (running.current === 0 || sequence.current === current)
            setPendingMethod(undefined);
        }
      }
    },
    [client, session],
  );
  useEffect(() => {
    active.current = true;
    session.invalidate();
    if (!client) return;
    let current = true;
    const initialSequence = sequence.current;
    const unlisten = client.listen((message) => {
      if (
        current &&
        message.kind === "event" &&
        message.event.topic === "account"
      ) {
        sequence.current++;
        // A published session is a conservative boundary: the contract has no identity generation.
        session.invalidate();
        session.confirm(message.event.value);
        setValue(message.event.value);
        setError(undefined);
      }
    });
    const unsubscribe = client.subscribe("account");
    void client
      .request({ method: "account.get" })
      .then((reply) => {
        if (!current || sequence.current !== initialSequence) return;
        if (reply.method !== "account.get")
          throw new HostFailure({ kind: "denied" });
        session.confirm(reply.value);
        setValue(reply.value);
      })
      .catch(() => {
        if (current && sequence.current === initialSequence)
          setError(text.failed);
      });
    return () => {
      current = false;
      active.current = false;
      session.invalidate();
      sequence.current++;
      unlisten();
      unsubscribe();
    };
  }, [client, session]);
  const state = {
    value,
    pending: pending || !!value?.working,
    pendingMethod,
    error,
    act,
    reload: () => {
      void act({ method: "account.get" });
    },
  };
  return (
    <AccountSessionContext.Provider value={session}>
      <Context.Provider value={state}>{children}</Context.Provider>
    </AccountSessionContext.Provider>
  );
}
