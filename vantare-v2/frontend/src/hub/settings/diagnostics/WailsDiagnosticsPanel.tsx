import { useMemo } from "react";
import { Events } from "@wailsio/runtime";
import {
  createDiagnosticsClient,
  type DiagnosticsEventTransport,
} from "./diagnostics-client";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

function createWailsTransport(): DiagnosticsEventTransport {
  return {
    emit(name, payload) {
      Events.Emit(name, payload);
    },
    on(name, listener) {
      return Events.On(name, listener);
    },
  };
}

export function WailsDiagnosticsPanel() {
  const client = useMemo(
    () => createDiagnosticsClient(createWailsTransport()),
    [],
  );
  return <DiagnosticsPanel client={client} />;
}
