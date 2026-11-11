import { onboardingStepsText as text } from "../../i18n/onboarding-pasos";
import "./account-step.css";
/** UI observations only. A's future adapter maps AccountView.gate/session here;
 * no unmerged wire types, credentials, URLs or login actions cross this boundary. */
export interface OnboardingAccountStatus {
  signedIn: boolean;
  checking: boolean;
  blocked: boolean;
  planLabel?: string;
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
  const message = value.checking
    ? text.accountChecking
    : value.blocked
      ? text.accountBlocked
      : value.signedIn
        ? value.planLabel
          ? text.accountPlan(value.planLabel)
          : text.accountUnconfirmed
        : text.accountUnavailable;
  return (
    <div className="v-ob-account">
      <p role="status">{message}</p>
      <p className="v-ob-account-note">{text.accountLocal}</p>
    </div>
  );
}
