import type { ComponentProps } from "react";
import { AccountProvider, useAccount } from "../../app/AccountState";
import { accountText } from "../../i18n/account.es";
import { onboardingStepsText as text } from "../../i18n/onboarding-pasos";
import { OnboardingAccountActions } from "./AccountActions";
import { OnboardingIntroPreview } from "./IntroPreview";

type Props = Omit<
  ComponentProps<typeof OnboardingIntroPreview>,
  "account" | "accountActions" | "accountPending" | "onPro" | "proDescription"
>;
function ConnectedIntro(props: Props) {
  const { value, pending, error, act } = useAccount();
  const blocked = !!value?.blocked;
  const signedIn = value?.session === "signedIn";
  const verified = signedIn && value.verified && !blocked;
  const accountPending =
    !value?.configured ||
    pending ||
    blocked ||
    value.purchase.waiting ||
    value.session === "pending" ||
    value.gate === "checking";
  return (
    <OnboardingIntroPreview
      {...props}
      accountActions={<OnboardingAccountActions />}
      accountPending={accountPending}
      onPro={() => {
        if (accountPending || !value) return;
        void act(
          signedIn
            ? { method: "account.purchase", product: "proMonthly" }
            : {
                method: "account.email",
                action: { action: "open", mode: "signInCode" },
              },
        );
      }}
      proDescription={
        signedIn ? accountText.checkoutNotice : text.emailDescription
      }
      account={{
        signedIn,
        blocked,
        failed: !!error && value?.gate !== "email",
        checking:
          !blocked &&
          !error &&
          (!value ||
            pending ||
            value.session === "pending" ||
            value.gate === "checking"),
        accessLabel:
          verified &&
          (value.plan.kind === "verified" || value.plan.kind === "founders")
            ? accountText.verified
            : undefined,
      }}
    />
  );
}
/** Reuse Access's reader and topic; login remains in its existing gate. */
export function OnboardingAccountIntro(props: Props) {
  return (
    <AccountProvider>
      <ConnectedIntro {...props} />
    </AccountProvider>
  );
}
