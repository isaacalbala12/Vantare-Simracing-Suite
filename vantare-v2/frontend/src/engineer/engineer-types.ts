import type { EngineerPresentation } from "./engineer-presentation-store";

export type EngineerNotification = EngineerPresentation;

export type EngineerOutputMode = "audio" | "visual" | "both" | "disabled";

export type EngineerStatus = {
  enabled: boolean;
  connected: boolean;
  source: string;
  presentationLifecycle: number;
  spotterEnabled: boolean;
  sensitivity: string;
  ttsCacheCount: number;
  recentMessages: EngineerNotification[];
  outputModes: Record<string, EngineerOutputMode>;
  subtitlesEnabled: boolean;
  lastError?: string;
};
