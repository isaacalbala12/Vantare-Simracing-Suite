import type { ProfileDocumentV3 } from "../overlay/core/profile-document";

const profilesByFile = new Map<string, ProfileDocumentV3>();

export function setServerHarnessBrowserViewProfile(file: string, document: ProfileDocumentV3): void {
  profilesByFile.set(file, structuredClone(document));
}

export function getServerHarnessBrowserViewProfile(file: string): ProfileDocumentV3 | null {
  const document = profilesByFile.get(file);
  return document ? structuredClone(document) : null;
}

export function clearServerHarnessBrowserViewProfiles(): void {
  profilesByFile.clear();
}