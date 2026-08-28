import type { EngineerPresentation } from "./engineer-presentation-store";

export type EngineerNotification = EngineerPresentation;

export type EngineerOutputMode = "audio" | "visual" | "both" | "disabled";

export type SpotterAvailability = {
  state: "disabled" | "waiting" | "ready" | "unavailable";
  reason?: "source" | "context" | "capability" | "player" | "spatial" | "pit_lane" | "low_speed";
};

export type EngineerStatus = {
  enabled: boolean;
  connected: boolean;
  source: string;
  presentationLifecycle: number;
  spotterEnabled: boolean;
  spotterAvailability: SpotterAvailability;
  sensitivity: string;
  ttsCacheCount: number;
  recentMessages: EngineerNotification[];
  outputModes: Record<string, EngineerOutputMode>;
  subtitlesEnabled: boolean;
  lastError?: string;
};
