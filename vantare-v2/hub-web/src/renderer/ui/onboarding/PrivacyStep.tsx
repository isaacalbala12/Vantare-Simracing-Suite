import { onboardingStepsText as text } from "../../i18n/onboarding-pasos";
import { Switch } from "../Forms";
import { PrivacyDetails } from "../PrivacyPresentation";
import "./privacy-step.css";
export interface OnboardingMailStatus {
  available: boolean;
  pending: boolean;
  consent: boolean;
  message?: string;
  onChange?: (value: boolean) => void;
}
function ConsentCard({
  label,
  hint,
  checked,
  pending = false,
  disabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  pending?: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="v-ob-consent-card" data-on={checked}>
      <div>
        <strong>{label}</strong>
        <p>{hint}</p>
      </div>
      <Switch
        label={label}
        hideLabel
        checked={checked}
        pending={pending}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}
export function PrivacyStep({
  crashes,
  usage,
  pending,
  configured,
  mail,
  onCrashes,
  onUsage,
  onPolicy,
}: {
  crashes: boolean;
  usage: boolean;
  pending: boolean;
  configured: boolean;
  mail?: OnboardingMailStatus;
  onCrashes: (value: boolean) => void;
  onUsage: (value: boolean) => void;
  onPolicy: () => void;
}) {
  return (
    <div className="v-ob-consent">
      <ConsentCard
        label={text.crashes}
        hint={text.crashesHint}
        checked={crashes}
        pending={pending}
        onChange={onCrashes}
      />
      <PrivacyDetails
        configured={configured}
        pending={pending}
        note={text.crashNotice}
        showPolicy={false}
        onPolicy={onPolicy}
      />
      <ConsentCard
        label={text.usage}
        hint={text.usageHint}
        checked={usage}
        pending={pending}
        onChange={onUsage}
      />
      <ConsentCard
        label={text.mail}
        hint={text.mailHint}
        checked={mail?.consent ?? false}
        pending={pending || mail?.pending}
        disabled={!mail?.available}
        onChange={(value) => mail?.onChange?.(value)}
      />
      <p className="v-ob-mail-note" role="status">
        {mail?.pending
          ? text.mailSaving
          : (mail?.message ??
            (mail?.available ? text.mailUnconfirmed : text.mailOff))}
      </p>
    </div>
  );
}
export function PrivacyArt({
  crashes,
  usage,
}: {
  crashes: boolean;
  usage: boolean;
}) {
  return (
    <div className="v-ob-feed">
      <small>{text.feedTitle}</small>
      <h2>
        {usage
          ? crashes
            ? text.feedBoth
            : text.feedUsage
          : crashes
            ? text.feedCrashes
            : text.feedNothing}
      </h2>
      <p>{text.anonymous}</p>
      <div className="v-ob-feed-yes">
        {text.feedRows.map(([name, value]) => (
          <div key={name} data-on={usage}>
            <i />
            <span>{name}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="v-ob-crash-feed">{text.crashFeed}</p>
      <small>{text.neverTitle}</small>
      <div className="v-ob-feed-no">
        {text.neverRows.map((name) => (
          <div key={name}>
            <s>{name}</s>
            <strong>{text.neverSend}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
