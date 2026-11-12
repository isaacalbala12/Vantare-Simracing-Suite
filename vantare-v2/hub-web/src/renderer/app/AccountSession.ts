import { createContext, useContext } from "react";
import type { AccountView } from "../../contract/generated/account";

/** Local invalidation only: no identity, credentials or new wire contract. */
export function createAccountSession() {
  let snapshot = { generation: 0, confirmed: false, ready: false };
  const listeners = new Set<() => void>();
  function publish(
    confirmed: boolean,
    generation = snapshot.generation,
    ready = confirmed,
  ) {
    snapshot = { generation, confirmed, ready };
    for (const listener of listeners) listener();
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    invalidate() {
      publish(false, snapshot.generation + 1);
    },
    confirm(value: AccountView) {
      publish(
        value.session === "signedIn" && value.gate === "none" && !value.blocked,
        snapshot.generation,
        // The local pilot also exists in the stable signed-out namespace.
        value.session !== "pending" && value.gate === "none" && !value.blocked,
      );
    },
  };
}
export type AccountSession = ReturnType<typeof createAccountSession>;
export const AccountSessionContext = createContext<AccountSession | undefined>(
  undefined,
);
export function useAccountSession() {
  const session = useContext(AccountSessionContext);
  if (!session) throw new Error("Missing AccountProvider session");
  return session;
}
