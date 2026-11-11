import {
  onboardingPricesUrl,
  privacyPolicyUrl,
} from "../contract/generated/contract";

/** One gate shared by both fixed public documents, across renderer ports. */
export function externalPages(
  open: (url: string) => Promise<void>,
  now = () => performance.now(),
) {
  type Method = "privacy.policy" | "onboarding.prices";
  let pending: { method: Method; result: Promise<boolean> } | undefined;
  let last: { method: Method; time: number; accepted: boolean } | undefined;
  return (method: Method): Promise<boolean> => {
    const target =
      method === "privacy.policy" ? privacyPolicyUrl : onboardingPricesUrl;
    if (!publicDocumentUrl(target)) return Promise.resolve(false);
    if (pending)
      return pending.method === method
        ? pending.result
        : Promise.resolve(false);
    const time = now();
    if (last && time - last.time < 2000)
      return Promise.resolve(last.method === method && last.accepted);
    const attempt = { method, time, accepted: false };
    last = attempt;
    const result = Promise.resolve()
      .then(() => open(target))
      .then(
        () => {
          attempt.accepted = true;
          return true;
        },
        () => false,
      )
      .finally(() => {
        pending = undefined;
      });
    pending = { method, result };
    return result;
  };
}

export function publicDocumentUrl(target: string): boolean {
  try {
    const url = new URL(target);
    return (
      url.protocol === "https:" &&
      url.hostname === "vantare.app" &&
      !url.port &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
