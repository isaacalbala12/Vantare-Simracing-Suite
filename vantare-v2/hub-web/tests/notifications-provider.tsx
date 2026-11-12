import { type ReactNode, useState } from "react";
import {
  AccountSessionContext,
  createAccountSession,
} from "../src/renderer/app/AccountSession";
import { NotificationsProvider as Provider } from "../src/renderer/screens/notifications/NotificationsState";
// Isolated notification fixtures provide the same local session boundary as AccountProvider.
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [session] = useState(createAccountSession);
  return (
    <AccountSessionContext.Provider value={session}>
      <Provider>{children}</Provider>
    </AccountSessionContext.Provider>
  );
}
