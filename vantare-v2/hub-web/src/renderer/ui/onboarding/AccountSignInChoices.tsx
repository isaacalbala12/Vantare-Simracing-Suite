import discord from "../../assets/onboarding/discord.svg?url";
import email from "../../assets/onboarding/email.svg?url";
import google from "../../assets/onboarding/google.svg?url";
import { onboardingStepsText as text } from "../../i18n/onboarding-pasos";
import { Button } from "../Button";
export function AccountSignInChoices({
  disabled,
  onBegin,
  onEmail,
}: {
  disabled: boolean;
  onBegin: () => void;
  onEmail: () => void;
}) {
  return (
    <>
      {[
        { id: "discord", label: text.loginDiscord, image: discord },
        { id: "google", label: text.loginGoogle, image: google },
        { id: "email", label: text.loginEmail, image: email },
      ].map((option) => (
        <Button
          key={option.id}
          className="v-ob-account-action"
          disabled={disabled}
          onClick={option.id === "email" ? onEmail : onBegin}
        >
          <img src={option.image} alt={""} aria-hidden="true" />
          {option.label}
          <span aria-hidden="true">{text.nextArrow}</span>
        </Button>
      ))}
    </>
  );
}
