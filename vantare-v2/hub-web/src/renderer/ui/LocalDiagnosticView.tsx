import type { LocalReportView } from "../../contract/generated/contract";
import { localDiagnosticText as text } from "../i18n/testing-local";
import { Button } from "./Button";
import { TrackedCaps } from "./TrackedCaps";
import "./local-diagnostic.css";

export function LocalDiagnosticView({
  view,
  busy,
  status,
  error,
  allowed,
  prepare,
  exportReport,
}: {
  view?: LocalReportView;
  busy: boolean;
  status: string;
  error?: string;
  allowed: boolean;
  prepare: () => Promise<void>;
  exportReport: () => Promise<void>;
}) {
  return (
    <div className="v-testing-diagnostic">
      <div className="v-testing-diagnostic-note">{text.privacy}</div>
      <div className="v-testing-diagnostic-actions">
        <Button disabled={!allowed || busy} onClick={() => void prepare()}>
          {busy ? text.preparing : text.prepare}
        </Button>
        <Button disabled={!allowed || busy || !view} onClick={() => void exportReport()}>
          {text.export}
        </Button>
      </div>
      <p className="v-testing-diagnostic-status" role="status">
        {status}
      </p>
      {error && (
        <div className="v-testing-diagnostic-note" role="alert">
          {error}
        </div>
      )}
      <section className="v-testing-diagnostic-card">
        <header>
          <h2>
            <TrackedCaps>{text.title}</TrackedCaps>
          </h2>
        </header>
        <div className="v-testing-diagnostic-body">
          {view ? (
            <>
              <p>{`${text.core}: ${text.links[view.core]}`}</p>
              <dl>
                {view.binaries.map((binary) => (
                  <div
                    className="v-testing-diagnostic-binary"
                    key={binary.name}
                  >
                    <dt>
                      <strong>{binary.name}</strong>
                      <span>{text.binaryStates[binary.state]}</span>
                    </dt>
                    <dd>{binary.sha256 ?? text.unavailable}</dd>
                  </div>
                ))}
              </dl>
              <p className="v-testing-diagnostic-uninstrumented">
                {text.uninstrumented}
              </p>
              <h3>
                <TrackedCaps>{text.payload}</TrackedCaps>
              </h3>
              <pre>{view.report}</pre>
            </>
          ) : (
            <p>{text.empty}</p>
          )}
        </div>
      </section>
    </div>
  );
}
