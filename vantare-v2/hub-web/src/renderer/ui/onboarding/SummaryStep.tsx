import {
  onboardingWidgets,
  type OnboardingWidgetKind as WidgetKind,
} from "../../../contract/generated/onboarding";
import type { PerformanceLevel } from "../../../contract/generated/settings";
import { t } from "../../i18n/es";
import { onboardingChoicesText, onboardingText } from "../../i18n/onboarding";
import { onboardingSummaryText as text } from "../../i18n/onboarding-summary";
import { Button } from "../Button";
import { type OnboardingAccountStatus, signedOutAccount } from "./AccountStep";
import type { OnboardingMailStatus } from "./PrivacyStep";
import "./summary-step.css";
export function SummaryStep({
  simulators,
  styles,
  kit,
  automatic,
  level,
  crashes,
  usage,
  account = signedOutAccount,
  mail,
  layoutReady,
  pending,
  studioReason,
  onFinish,
}: {
  simulators: readonly boolean[];
  styles: readonly boolean[];
  kit: readonly WidgetKind[];
  automatic: boolean;
  level: PerformanceLevel;
  crashes: boolean;
  usage: boolean;
  account?: OnboardingAccountStatus;
  mail?: OnboardingMailStatus;
  layoutReady: boolean;
  pending: boolean;
  studioReason?: string;
  onFinish: (show: boolean) => void;
}) {
  const rows: readonly (readonly [string, string, boolean])[] = [
    [
      text.simulators,
      onboardingChoicesText.simulators
        .filter((_, i) => simulators[i])
        .map((x) => x.name)
        .join(" y "),
      true,
    ],
    [
      text.styles,
      onboardingChoicesText.styles
        .filter((_, i) => styles[i])
        .map((x) => x.name)
        .join(", "),
      true,
    ],
    [
      text.widgets,
      onboardingText.widgetsSummary(
        kit.length,
        onboardingWidgets.filter((x) => kit.includes(x.kind) && !x.free).length,
      ),
      true,
    ],
    [
      text.plan,
      account.signedIn ? (account.planLabel ?? text.unconfirmed) : text.guest,
      !account.signedIn || !!account.planLabel,
    ],
    [text.performance, automatic ? text.automatic : t(`track.${level}`), true],
    [text.usage, usage ? text.enabled : text.disabled, usage],
    [text.crashes, crashes ? text.enabled : text.disabled, crashes],
    [
      text.mail,
      !account.signedIn
        ? text.guestMail
        : !mail?.available || mail.pending
          ? text.unconfirmed
          : mail.consent
            ? text.enabled
            : text.disabled,
      !!mail?.available && !mail.pending && mail.consent,
    ],
  ];
  return (
    <div className="v-ob-summary">
      <dl>
        {rows.map(([label, value, confirmed]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
            <span data-confirmed={confirmed} aria-hidden="true">
              {confirmed ? text.confirmed : text.unknown}
            </span>
          </div>
        ))}
      </dl>
      {!layoutReady && <p role="status">{text.notPrepared}</p>}
      <div className="v-ob-summary-actions">
        <Button
          className="v-ob-button v-ob-button--primary"
          disabled={pending}
          onClick={() => onFinish(true)}
        >
          {layoutReady ? text.open : text.prepare}
        </Button>
        {layoutReady && (
          <Button
            className="v-ob-button"
            disabled={pending || !!studioReason}
            onClick={() => onFinish(false)}
          >
            {text.edit}
          </Button>
        )}
      </div>
      {layoutReady && studioReason && <p role="status">{studioReason}</p>}
    </div>
  );
}
