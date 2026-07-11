import type { ProfileDocumentV3 } from "../overlay/core/profile-document";
import { deltaDefinition } from "../overlay/widget-types/delta/delta-definition";
import { relativeDefinition } from "../overlay/widget-types/relative/relative-definition";
import { standingsDefinition } from "../overlay/widget-types/standings/standings-definition";

export type HubMockProfileEntry = {
  id: string;
  file: string;
  name: string;
  displayMode: "edit" | "racing" | "streaming";
  widgets: number;
};

type StoredDocument = {
  document: ProfileDocumentV3;
  revision: string;
};

export type HubMockSettings = {
  betaWelcomeCompleted: boolean;
  betaUserRole: string;
  activeOverlayProfileId: string | null;
  deltaMode: string;
  cpuSampling: boolean;
  hotkeys: Record<string, unknown>;
};

export type HubMockSeed = "empty" | "active";

let profiles: HubMockProfileEntry[] = [];
let documents = new Map<string, StoredDocument>();
let activeProfileId: string | null = null;

function defaultSettings(): HubMockSettings {
  return {
    betaWelcomeCompleted: true,
    betaUserRole: "racer",
    activeOverlayProfileId: null,
    deltaMode: "relative",
    cpuSampling: true,
    hotkeys: {},
  };
}

let settings: HubMockSettings = defaultSettings();

function slugifyProfileName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "new-profile";
}

export function buildDefaultCreatedProfileDocument(id: string, name: string): ProfileDocumentV3 {
  const delta = deltaDefinition.createDefault("delta");
  delta.layout = { ...delta.layout, x: 760, y: 40, w: 400, h: 48, zIndex: 1 };

  const relative = relativeDefinition.createDefault("relative");
  relative.layout = { ...relative.layout, x: 40, y: 600, w: 320, h: 280, zIndex: 2 };

  const standings = standingsDefinition.createDefault("standings");
  standings.layout = { ...standings.layout, x: 1560, y: 40, w: 340, h: 420, zIndex: 3 };

  return {
    schemaVersion: 3,
    id,
    name,
    displayMode: "edit",
    monitorIndex: 0,
    layouts: {
      general: {
        type: "general",
        widgets: [delta, relative, standings],
      },
    },
  };
}

function storeDocument(file: string, document: ProfileDocumentV3, revision = "rev-mock-1"): void {
  documents.set(file, {
    document: structuredClone(document),
    revision,
  });
}

function seedActiveProfile(): void {
  const id = "default-racing";
  const file = "example-racing.json";
  const document = buildDefaultCreatedProfileDocument(id, "Default Racing");
  storeDocument(file, document);
  profiles = [
    {
      id,
      file,
      name: "Default Racing",
      displayMode: "edit",
      widgets: document.layouts.general?.widgets.length ?? 0,
    },
  ];
  activeProfileId = id;
  settings = {
    ...defaultSettings(),
    activeOverlayProfileId: id,
  };
}

export function resetHubMockState(seed: HubMockSeed = "empty"): void {
  profiles = [];
  documents = new Map();
  activeProfileId = null;
  settings = defaultSettings();
  if (seed === "active") {
    seedActiveProfile();
  }
}

export function listHubProfiles(): HubMockProfileEntry[] {
  return profiles.map((profile) => ({ ...profile }));
}

export function getHubMockSettings(): HubMockSettings {
  return {
    ...settings,
    hotkeys: { ...settings.hotkeys },
  };
}

export function getActiveHubProfileId(): string | null {
  return activeProfileId;
}

export function createHubProfile(name: string): HubMockProfileEntry | { error: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "profile name is required" };
  }

  const id = `custom-${slugifyProfileName(trimmed)}`;
  const file = `${id}.json`;
  if (documents.has(file)) {
    return { error: `profile already exists: ${id}` };
  }

  const document = buildDefaultCreatedProfileDocument(id, trimmed);
  storeDocument(file, document);

  const entry: HubMockProfileEntry = {
    id,
    file,
    name: trimmed,
    displayMode: "edit",
    widgets: document.layouts.general?.widgets.length ?? 0,
  };
  profiles = [...profiles, entry];
  return entry;
}

export function setActiveHubProfile(id: string, file: string): void {
  activeProfileId = id;
  settings = {
    ...settings,
    activeOverlayProfileId: id,
  };
  void file;
}

export function loadHubDocument(file: string): StoredDocument | null {
  const stored = documents.get(file);
  if (!stored) {
    return null;
  }
  return {
    document: structuredClone(stored.document),
    revision: stored.revision,
  };
}

export function saveHubDocument(
  file: string,
  document: ProfileDocumentV3,
  expectedRevision: string,
): { ok: true; revision: string } | { ok: false; kind: "conflict" | "error"; message: string } {
  const stored = documents.get(file);
  if (!stored) {
    return { ok: false, kind: "error", message: `profile not found: ${file}` };
  }
  if (stored.revision !== expectedRevision) {
    return { ok: false, kind: "conflict", message: "profile revision conflict" };
  }
  const revision = `rev-mock-${Date.now()}`;
  storeDocument(file, document, revision);
  return { ok: true, revision };
}