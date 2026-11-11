import type { ComponentProps } from "react";
import { AccountProvider, useAccount } from "../../app/AccountState";
import { accountText } from "../../i18n/account.es";
import { OnboardingIntroPreview } from "./IntroPreview";

type Props = Omit<ComponentProps<typeof OnboardingIntroPreview>, "account">;
function ConnectedIntro(props: Props) {
  const { value, pending, error } = useAccount();
  const blocked = !!value?.blocked;
  const signedIn = value?.session === "signedIn";
  const verified = signedIn && value.verified && !blocked;
  return (
    <OnboardingIntroPreview
      {...props}
      account={{
        signedIn,
        blocked,
        failed: !!error,
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
