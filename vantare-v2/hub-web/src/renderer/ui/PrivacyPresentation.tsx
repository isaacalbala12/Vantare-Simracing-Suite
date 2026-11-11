import type { ReactNode } from "react";
import { t } from "../i18n/es";
import { privacyText as text } from "../i18n/privacy.es";
import { Button } from "./Button";
import { RailBlock } from "./Frame";
import "./privacy.css";
export function PrivacyLayout({ children }: { children: ReactNode }) {
  return <div className="v-privacy">{children}</div>;
}
export function PrivacyDetails({
  configured,
  pending,
  onPolicy,
}: {
  configured: boolean;
  pending: boolean;
  onPolicy: () => void;
}) {
  return (
    <>
      <p className="v-privacy-note">{text.note}</p>
      {!configured && (
        <p className="v-privacy-send-note">{text.notConfigured}</p>
      )}
      <div className="v-privacy-policy">
        <Button
          variant="ghost"
          aria-busy={pending || undefined}
          aria-disabled={pending || undefined}
          onClick={() => {
            if (!pending) onPolicy();
          }}
        >
          {t("privacy.policy")}
        </Button>
      </div>
    </>
  );
}
export function MailConsent({
  message,
  consent,
  intent,
  pending,
  available,
  onChange,
  onRefresh,
}: {
  message: string;
  consent: boolean;
  intent?: boolean;
  pending: boolean;
  available: boolean;
  onChange: (value: boolean) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="v-privacy-mail">
      <p role="status">{message}</p>
      <Button
        aria-busy={pending || undefined}
        aria-disabled={!available || pending || undefined}
        onClick={() => {
          if (available && !pending) onChange(intent ?? !consent);
        }}
      >
        {intent !== undefined
          ? text.retry
          : consent
            ? text.disable
            : text.enable}
      </Button>
      <Button
        aria-disabled={!available || pending || undefined}
        onClick={() => {
          if (available && !pending) onRefresh();
        }}
      >
        {text.refresh}
      </Button>
    </div>
  );
}
export function PrivacyRail() {
  return (
    <div className="v-privacy-rail">
      <RailBlock title={text.what} icon="v-shield">
        <p>{text.whatHelp}</p>
      </RailBlock>
      <RailBlock title={text.never} icon="v-lock">
        <p>{text.neverHelp}</p>
      </RailBlock>
    </div>
  );
}
