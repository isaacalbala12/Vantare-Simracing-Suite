import type { ProfileDocumentV3 } from "../overlay/core/profile-document";

export async function syncHarnessBrowserViewProfile(file: string, document: ProfileDocumentV3): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  try {
    await fetch("/api/harness/browser-view-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file, document }),
    });
  } catch {
    // Harness dev server only; ignore when middleware is unavailable.
  }
}