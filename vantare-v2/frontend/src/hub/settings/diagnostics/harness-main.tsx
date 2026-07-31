import { createRoot } from "react-dom/client";
import "../../../index.css";
import { I18nProvider } from "../../../i18n/I18nProvider";
import type { DiagnosticsActions } from "./diagnostics-actions";
import type { DiagnosticsClient } from "./diagnostics-client";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import {
  createFixtureDiagnosticsClient,
  fixturePrepared,
} from "./test-fixtures";

document.documentElement.classList.add("hub");
document.body.classList.add("hub");

const fixtureClient = createFixtureDiagnosticsClient(80);
const client: DiagnosticsClient = {
  ...fixtureClient,
  inspectSession(handle, signal) {
    const root = document.documentElement;
    root.dataset.diagnosticsInspectCount = String(
      Number(root.dataset.diagnosticsInspectCount ?? "0") + 1,
    );
    return fixtureClient.inspectSession(handle, signal);
  },
};

const actions: DiagnosticsActions = {
  async copy(payload) {
    document.documentElement.dataset.diagnosticsCopiedPayload = payload;
  },
  download(prepared) {
    document.documentElement.dataset.diagnosticsDownloadedPayload =
      prepared.payload;
  },
};

document.documentElement.dataset.diagnosticsInspectCount = "0";
document.documentElement.dataset.diagnosticsExpectedPayload =
  fixturePrepared.payload;

const root = document.getElementById("root");
if (!root) {
  throw new Error("diagnostics harness root missing");
}

createRoot(root).render(
  <I18nProvider>
    <main className="premium-bg min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[90rem]">
        <DiagnosticsPanel client={client} actions={actions} />
      </div>
    </main>
  </I18nProvider>,
);
