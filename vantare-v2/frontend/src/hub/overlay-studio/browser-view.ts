import type { StudioSaveResult } from "./state/studio-profile-client";

export type BrowserViewDecision = "save" | "cancel";

export type OpenBrowserViewInput = {
  dirty: boolean;
  profileFile: string;
  baseUrl: string;
  studioPreview?: boolean;
  decide: () => Promise<BrowserViewDecision>;
  save: () => Promise<StudioSaveResult>;
  open: (url: string) => void;
};

export type OpenBrowserViewResult = "opened" | "cancelled" | "failed";

export function buildBrowserViewUrl(
  baseUrl: string,
  profileFile: string,
  options?: { studioPreview?: boolean },
): string {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ profile: profileFile });
  if (options?.studioPreview) {
    params.set("studioPreview", "1");
  }
  return `${normalizedBase}/overlay?${params.toString()}`;
}

export async function openBrowserView(input: OpenBrowserViewInput): Promise<OpenBrowserViewResult> {
  const url = buildBrowserViewUrl(input.baseUrl, input.profileFile, {
    studioPreview: input.studioPreview,
  });

  if (!input.dirty) {
    input.open(url);
    return "opened";
  }

  const decision = await input.decide();
  if (decision === "cancel") {
    return "cancelled";
  }

  const saveResult = await input.save();
  if (saveResult.status !== "saved") {
    return "failed";
  }

  input.open(url);
  return "opened";
}