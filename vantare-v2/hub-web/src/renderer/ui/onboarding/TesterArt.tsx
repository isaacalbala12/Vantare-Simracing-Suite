import { licenseDate, accountText as text } from "../../i18n/account.es";
import { TrackedCaps } from "../TrackedCaps";
import "./tester-art.css";
/** Account step art for a signed tester: states the access, never sells. */
export function TesterArt({ until }: { until?: number | null }) {
  return (
    <div className="v-ob-tester">
      <div className="v-ob-tester-pass">
        <div className="v-ob-tester-heading">
          <span className="v-ob-wordmark" aria-hidden="true" />
          <span className="v-ob-tester-chip">
            <TrackedCaps>{text.beta}</TrackedCaps>
          </span>
        </div>
        <h2>{text.testerTitle}</h2>
        <p className="v-ob-tester-lead">{text.testerLead}</p>
        <p>{text.betaHelpTester}</p>
        {/* Only the host's signed date; without it there is no date row. */}
        {until != null && (
          <>
            <dl>
              <dt>{text.validUntil}</dt>
              <dd>{licenseDate(until)}</dd>
            </dl>
            <p className="v-ob-tester-note">{text.renewsOnline}</p>
          </>
        )}
      </div>
    </div>
  );
}
