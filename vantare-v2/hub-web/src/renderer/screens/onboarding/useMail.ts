import { useEffect, useRef, useState } from "react";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { onboardingStepsText as text } from "../../i18n/onboarding-pasos";
import type { OnboardingMailStatus } from "../../ui/onboarding/PrivacyStep";

/** Staged independently from account consent: never opt in just by reading it. */
export function useOnboardingMail(allowed: boolean, enabled: boolean) {
  const { client } = useHost();
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState<boolean>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const epoch = useRef(0);
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  useEffect(() => {
    const current = ++epoch.current;
    setConsent(false);
    setSaved(undefined);
    setFailed(false);
    if (!enabled || !allowed || !client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void client
      .request({ method: "mail.get" })
      .then((reply) => {
        if (epoch.current !== current) return;
        if (reply.method !== "mail.get") throw new HostFailure({ kind: "io" });
        setSaved(reply.value.consent);
      })
      .catch(() => {
        if (epoch.current === current) setFailed(true);
      })
      .finally(() => {
        if (epoch.current === current) setLoading(false);
      });
    return () => {
      epoch.current++;
    };
  }, [allowed, enabled, client]);
  const available =
    enabled && allowed && !loading && saved !== undefined && !failed;
  const mail: OnboardingMailStatus = {
    available,
    consent: available && consent,
    pending: loading,
    message: !allowed
      ? text.mailOff
      : failed
        ? text.mailUnavailable
        : text.mailAtFinish,
    onChange: (value) => {
      if (available) setConsent(value);
    },
  };
  async function commitMail() {
    if (!enabled || !allowedRef.current) return;
    if (loading) throw new HostFailure({ kind: "busy" });
    if (!available || consent === saved || !client) return;
    const current = epoch.current;
    // Revalidate the current gate before a durable choice; no email/token in this screen.
    const account = await client.request({ method: "account.get" });
    if (
      current !== epoch.current ||
      !allowedRef.current ||
      account.method !== "account.get" ||
      account.value.session !== "signedIn" ||
      account.value.gate !== "none" ||
      account.value.blocked
    )
      throw new HostFailure({ kind: "denied" });
    const reply = await client.request({
      method: "mail.set",
      consent,
      source: "onboarding",
    });
    if (
      current !== epoch.current ||
      reply.method !== "mail.set" ||
      reply.value.consent !== consent
    )
      throw new HostFailure({ kind: "io" });
    setSaved(reply.value.consent);
  }
  return { mail, commitMail };
}
