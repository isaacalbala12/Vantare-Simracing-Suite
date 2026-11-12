import { useEffect, useRef, useState } from "react";
import { useHost } from "../../app/Host";
import { HostFailure } from "../../bridge/client";
import { onboardingStepsText as text } from "../../i18n/onboarding-pasos";
import type { OnboardingMailStatus } from "../../ui/onboarding/PrivacyStep";

/** Undefined means untouched: reading an existing choice never revokes it. */
export function useOnboardingMail(
  allowed: boolean,
  enabled: boolean,
  disabledReason: string = text.mailOff,
) {
  const { client } = useHost();
  const [staged, setStaged] = useState<boolean>();
  const [saved, setSaved] = useState<boolean>();
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [failed, setFailed] = useState(false);
  const epoch = useRef(0);
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  useEffect(() => {
    const current = ++epoch.current;
    setStaged(undefined);
    setSaved(undefined);
    setFailed(false);
    setWriting(false);
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
  // mail.get and mail.set both require a verified primary email server-side.
  // AccountView.verified describes access rights, not email verification.
  const available = enabled && allowed && !loading && saved !== undefined;
  const mail: OnboardingMailStatus = {
    available,
    consent: allowed ? (staged ?? saved ?? false) : false,
    pending: loading || writing,
    reading: loading,
    unconfirmed: allowed && (failed || loading || saved === undefined),
    message: !allowed
      ? disabledReason
      : failed
        ? text.mailNotConfirmed
        : text.mailAtFinish,
    onChange: (value) => {
      if (available) {
        setStaged(value);
        setFailed(false);
      }
    },
  };
  async function commitMail(): Promise<"ok" | "failed"> {
    if (!enabled || !allowedRef.current) return "ok";
    if (loading) {
      setFailed(true);
      return "failed";
    }
    if (staged === undefined || staged === saved) return "ok";
    const current = epoch.current;
    const fail = () => {
      if (epoch.current === current) setFailed(true);
      return "failed" as const;
    };
    if (!available || !client) return fail();
    const consent = staged;
    setWriting(true);
    try {
      const account = await client.request({ method: "account.get" });
      if (
        current !== epoch.current ||
        !allowedRef.current ||
        account.method !== "account.get" ||
        account.value.session !== "signedIn" ||
        account.value.gate !== "none" ||
        account.value.blocked
      )
        return fail();
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
        return fail();
      setSaved(reply.value.consent);
      setStaged(undefined);
      setFailed(false);
      return "ok";
    } catch {
      return fail();
    } finally {
      if (current === epoch.current) setWriting(false);
    }
  }
  return { mail, commitMail };
}
