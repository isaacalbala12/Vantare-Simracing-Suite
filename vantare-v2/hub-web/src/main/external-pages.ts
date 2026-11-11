import {
  onboardingPricesUrl,
  privacyPolicyUrl,
} from "../contract/generated/contract";

/** One gate shared by both fixed public documents, across renderer ports. */
export function externalPages(
  open: (url: string) => Promise<void>,
  now = () => performance.now(),
) {
  let pending = false;
  let last: number | undefined;
  return async (
    method: "privacy.policy" | "onboarding.prices",
  ): Promise<boolean> => {
    const target =
      method === "privacy.policy" ? privacyPolicyUrl : onboardingPricesUrl;
    if (!publicDocumentUrl(target)) return false;
    const time = now();
    if (pending || (last !== undefined && time - last < 2000)) return false;
    pending = true;
    last = time;
    try {
      await open(target);
      return true;
    } catch {
      return false;
    } finally {
      pending = false;
    }
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
