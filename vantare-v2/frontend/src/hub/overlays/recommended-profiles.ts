import type { ProfileConfig } from "../../lib/profile";

export type RecommendedProfile = {
  id: string;
  name: string;
  description: string;
  tag: "racing" | "streaming" | "minimal";
  readOnly: true;
  profile: ProfileConfig;
};

export const RECOMMENDED_PROFILES: RecommendedProfile[] = [
  {
    id: "vantare-racing-basic",
    name: "Racing Básico",
    description: "Delta, relative y standings para conducir con información esencial.",
    tag: "racing",
    readOnly: true,
    profile: {
      id: "vantare-racing-basic",
      name: "Racing Básico",
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [
        { id: "delta", type: "delta", enabled: true, updateHz: 30, position: { x: 760, y: 40, w: 400, h: 48 } },
        { id: "relative", type: "relative", enabled: true, updateHz: 15, position: { x: 40, y: 600, w: 320, h: 280 } },
        { id: "standings", type: "standings", enabled: true, updateHz: 15, position: { x: 1560, y: 40, w: 340, h: 420 } },
      ],
    },
  },
  {
    id: "vantare-stream-clean",
    name: "Streamer Clean",
    description: "Layout OBS limpio con datos legibles y poco ruido visual.",
    tag: "streaming",
    readOnly: true,
    profile: {
      id: "vantare-stream-clean",
      name: "Streamer Clean",
      displayMode: "streaming",
      monitorIndex: 0,
      widgets: [
        { id: "standings", type: "standings", enabled: true, updateHz: 15, position: { x: 1450, y: 70, w: 380, h: 500 } },
        { id: "relative", type: "relative", enabled: true, updateHz: 15, position: { x: 70, y: 650, w: 360, h: 300 } },
        { id: "telemetry", type: "telemetry", enabled: true, updateHz: 30, position: { x: 760, y: 900, w: 420, h: 120 } },
      ],
    },
  },
  {
    id: "vantare-minimal-telemetry",
    name: "Minimal Telemetry",
    description: "Solo telemetría esencial para pantallas pequeñas o PCs modestos.",
    tag: "minimal",
    readOnly: true,
    profile: {
      id: "vantare-minimal-telemetry",
      name: "Minimal Telemetry",
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [
        { id: "telemetry-vertical", type: "telemetry-vertical", enabled: true, updateHz: 30, position: { x: 40, y: 380, w: 140, h: 360 } },
        { id: "pedals", type: "pedals", enabled: true, updateHz: 30, position: { x: 40, y: 760, w: 180, h: 220 } },
      ],
    },
  },
];

export function cloneRecommendedProfile(profile: RecommendedProfile, name: string): ProfileConfig {
  const safeName = name.trim() || `${profile.name} Copy`;
  const slug = safeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return {
    ...structuredClone(profile.profile),
    id: `custom-${slug || profile.id}`,
    name: safeName,
  };
}
