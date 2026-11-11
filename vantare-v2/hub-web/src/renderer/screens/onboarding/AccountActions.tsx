import { useAccount } from "../../app/AccountState";
import { accessText } from "../../i18n/access.es";
import { accountText } from "../../i18n/account.es";
import { onboardingStepsText as text } from "../../i18n/onboarding-pasos";
import { Button } from "../../ui/Button";
import { AccountSignInChoices } from "../../ui/onboarding/AccountSignInChoices";
import { EmailForm } from "../account/EmailForm";
import "../account/access.css";
export function OnboardingAccountActions() {
  const { value, pending, act } = useAccount();
  if (value?.gate === "email" && value.email)
    return <EmailForm key={value.email.mode} value={value.email} />;
  if (value?.session === "signedIn")
    return value.purchase.waiting ? <p>{accountText.purchaseWaiting}</p> : null;
  if (value?.blocked) return <p>{text.accountBlocked}</p>;
  if (value?.gate === "waitingBrowser" || value?.gate === "canceling")
    return (
      <>
        <p>
          {value.gate === "canceling"
            ? accessText.canceling
            : accessText.waitingBrowser}
        </p>
        <Button
          disabled={pending}
          onClick={() => void act({ method: "account.cancel" })}
        >
          {accessText.cancel}
        </Button>
      </>
    );
  const disabled =
    !value?.configured ||
    pending ||
    value.session === "pending" ||
    value.gate === "checking";
  return (
    <>
      <AccountSignInChoices
        disabled={disabled}
        onBegin={() => void act({ method: "account.begin" })}
        onEmail={() =>
          void act({
            method: "account.email",
            action: { action: "open", mode: "signInCode" },
          })
        }
      />
      {value && !value.configured && <p>{accountText.notConfigured}</p>}
    </>
  );
}
