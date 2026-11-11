import { accountText } from "../../i18n/account.es";
import { onboardingStepsText as text } from "../../i18n/onboarding-pasos";
import "./account-step.css";
/** UI observations only; credentials, URLs and login actions stay in Access. */
export interface OnboardingAccountStatus {
  signedIn: boolean;
  checking: boolean;
  blocked: boolean;
  planLabel?: string;
  accessLabel?: string;
  failed?: boolean;
}
export const signedOutAccount: OnboardingAccountStatus = {
  signedIn: false,
  checking: false,
  blocked: false,
};
export function AccountStep({
  value = signedOutAccount,
}: {
  value?: OnboardingAccountStatus;
}) {
  const message = value.blocked
    ? text.accountBlocked
    : value.failed
      ? accountText.failed
      : value.checking
        ? text.accountChecking
        : value.signedIn
          ? (value.accessLabel ??
            (value.planLabel
              ? text.accountPlan(value.planLabel)
              : text.accountUnconfirmed))
          : text.accountUnavailable;
  return (
    <div className="v-ob-account" data-guest={!value.signedIn}>
      <p>{message}</p>
      <p className="v-ob-account-note">{text.accountLocal}</p>
    </div>
  );
}
