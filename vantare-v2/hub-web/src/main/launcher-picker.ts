import type { HostToUi, UiToHost } from "../contract/generated/contract";
import { bounded, isUiMessage } from "../contract/validation";

/** One native dialog per window. A path is forwarded only on the trusted host pipe. */
export function executablePicker(
  open: () => Promise<string | undefined>,
  sendHost: (message: UiToHost) => void,
) {
  let pending = false;
  return async (
    id: number,
    reply: (message: HostToUi) => void,
    connected: () => boolean,
  ) => {
    const fail = (kind: "busy" | "io") => {
      if (connected()) reply({ kind: "failure", id, error: { kind } });
    };
    if (pending) {
      fail("busy");
      return;
    }
    pending = true;
    try {
      const path = await open();
      if (!connected()) return;
      const message = { kind: "pickedExecutable", id, path: path ?? null };
      if (!isUiMessage(message) || !bounded(message)) {
        fail("io");
        return;
      }
      sendHost(message);
    } catch {
      fail("io");
    } finally {
      pending = false;
    }
  };
}
