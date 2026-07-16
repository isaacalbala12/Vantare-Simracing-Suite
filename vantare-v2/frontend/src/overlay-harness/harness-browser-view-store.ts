import type { ProfileDocumentV3 } from "../overlay/core/profile-document";

const profilesByFile = new Map<string, ProfileDocumentV3>();

export function setHarnessBrowserViewProfile(file: string, document: ProfileDocumentV3): void {
  profilesByFile.set(file, structuredClone(document));
}

export function getHarnessBrowserViewProfile(file: string): ProfileDocumentV3 | null {
  const document = profilesByFile.get(file);
  return document ? structuredClone(document) : null;
}

export function clearHarnessBrowserViewProfiles(): void {
  profilesByFile.clear();
}