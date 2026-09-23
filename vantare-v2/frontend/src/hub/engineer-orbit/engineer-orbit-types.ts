import type { EngineerOutputMode, EngineerStatus } from "../../engineer/engineer-types";

type DeliveryDiagnostic = {
  id: string; lifecycle: number; intent: string; family: string; text: string;
  mode: EngineerOutputMode; selectedAt: number; updatedAt: number;
  state: string; reason: string; visual: boolean; audio: string;
};
export type EngineerDiagnostics = {
  version: 1; capturedAt: number; running: boolean; status: EngineerStatus;
  health: {
    ok: boolean; dropCount: number; activeFamilies: number;
    policy: { pending: number; accepted: number; emitted: number; suppressed: number; expired: number; cancelled: number; unavailable: number };
    radioDelivery: { samples: number; p95MS: number; maximumMS: number };
    voiceInput?: { enabled: boolean; state: string };
  };
  subtitlesPreference: boolean; visualPresentationEnabled: boolean; playerAvailable: boolean; cacheOnly: boolean; locale: string;
  spotterVoice: string; engineerVoice: string; audioTestActive: boolean;
  historyLimit: number; radioHistoryAvailable: boolean; deliveries: DeliveryDiagnostic[];
};
export type EngineerChange =
  | { action: "enabled" | "spotter" | "subtitles"; enabled: boolean }
  | { action: "sensitivity"; value: string }
  | { action: "output"; category: string; value: EngineerOutputMode };
export type ChangeResult = { outcome: "saved" | "save_failed" | "rejected"; diagnostics: EngineerDiagnostics };
export type AudioTestResult = { kind: "tone" | "cached"; outcome: string; text?: string; finishedAt: number };
