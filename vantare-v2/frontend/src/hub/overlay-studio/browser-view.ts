import type { StudioSaveResult } from "./state/studio-profile-client";

export type BrowserViewDecision = "save" | "cancel";

export type OpenBrowserViewInput = {
  dirty: boolean;
  profileFile: string;
  baseUrl: string;
  decide: () => Promise<BrowserViewDecision>;
  save: () => Promise<StudioSaveResult>;
  open: (url: string) => void;
};

export type OpenBrowserViewResult = "opened" | "cancelled" | "failed";

export function buildBrowserViewUrl(baseUrl: string, profileFile: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return `${normalizedBase}/overlay?profile=${encodeURIComponent(profileFile)}`;
}

export async function openBrowserView(input: OpenBrowserViewInput): Promise<OpenBrowserViewResult> {
  const url = buildBrowserViewUrl(input.baseUrl, input.profileFile);

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