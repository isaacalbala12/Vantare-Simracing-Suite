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
    id: "vantare-clean-overlay",
    name: "Clean Overlay",
    description: "Overlay limpio con delta, relative y standings para correr sin ruido.",
    tag: "racing",
    readOnly: true,
    profile: {
      schemaVersion: 2,
      id: "vantare-clean-overlay",
      name: "Clean Overlay",
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [
        {
          id: "delta",
          type: "delta",
          enabled: true,
          updateHz: 30,
          position: { x: 720, y: 32, w: 480, h: 160 }
        },
        {
          id: "relative",
          type: "relative",
          variantId: "variant-relative-default",
          enabled: true,
          updateHz: 15,
          position: { x: 32, y: 600, w: 380, h: 320 }
        },
        {
          id: "standings",
          type: "standings",
          enabled: true,
          updateHz: 15,
          position: { x: 1548, y: 80, w: 340, h: 520 }
        }
      ],
      layouts: {
        general: {
          type: "general",
          widgets: [
            {
              id: "delta",
              type: "delta",
              enabled: true,
              updateHz: 30,
              position: { x: 720, y: 32, w: 480, h: 160 }
            },
            {
              id: "relative",
              type: "relative",
              variantId: "variant-relative-default",
              enabled: true,
              updateHz: 15,
              position: { x: 32, y: 600, w: 380, h: 320 }
            },
            {
              id: "standings",
              type: "standings",
              enabled: true,
              updateHz: 15,
              position: { x: 1548, y: 80, w: 340, h: 520 }
            }
          ]
        }
      },
      variants: [
        {
          id: "variant-relative-default",
          widgetType: "relative",
          templateId: "relative-vantare-default",
          themeId: "vantare-racing",
          name: "Relative Default",
          columns: [
            { id: "position", metricId: "position", enabled: true, width: 24 },
            { id: "class", metricId: "class", enabled: true, width: 6 },
            { id: "carNumber", metricId: "carNumber", enabled: true, width: 28 },
            { id: "driverName", metricId: "driverName", enabled: true, width: 120 },
            { id: "gap", metricId: "gap", enabled: true, width: 48 },
            { id: "bestLap", metricId: "bestLap", enabled: true, width: 62 },
            { id: "lastLap", metricId: "lastLap", enabled: true, width: 62 }
          ]
        }
      ]
    }
  },
  {
    id: "vantare-lmu-basic",
    name: "Le Mans Ultimate - Basic",
    description: "Perfil básico para Le Mans Ultimate con delta, relative, standings y pedals.",
    tag: "racing",
    readOnly: true,
    profile: {
      schemaVersion: 2,
      id: "vantare-lmu-basic",
      name: "Le Mans Ultimate - Basic",
      displayMode: "racing",
      monitorIndex: 0,
      widgets: [
        {
          id: "delta",
          type: "delta",
          variantId: "variant-delta-default",
          enabled: true,
          updateHz: 30,
          position: { x: 720, y: 32, w: 480, h: 160 }
        },
        {
          id: "relative",
          type: "relative",
          variantId: "variant-relative-default",
          enabled: true,
          updateHz: 15,
          position: { x: 32, y: 736, w: 380, h: 320 }
        },
        {
          id: "standings",
          type: "standings",
          variantId: "variant-standings-default",
          enabled: true,
          updateHz: 15,
          position: { x: 32, y: 72, w: 380, h: 540 }
        },
        {
          id: "pedals",
          type: "pedals",
          enabled: false,
          updateHz: 30,
          position: { x: 1798, y: 72, w: 90, h: 100 }
        }
      ],
      layouts: {
        general: {
          type: "general",
          widgets: [
            {
              id: "delta",
              type: "delta",
              variantId: "variant-delta-default",
              enabled: true,
              updateHz: 30,
              position: { x: 720, y: 32, w: 480, h: 160 }
            },
            {
              id: "relative",
              type: "relative",
              variantId: "variant-relative-default",
              enabled: true,
              updateHz: 15,
              position: { x: 32, y: 736, w: 380, h: 320 }
            },
            {
              id: "standings",
              type: "standings",
              variantId: "variant-standings-default",
              enabled: true,
              updateHz: 15,
              position: { x: 32, y: 72, w: 380, h: 540 }
            },
            {
              id: "pedals",
              type: "pedals",
              enabled: false,
              updateHz: 30,
              position: { x: 1798, y: 72, w: 90, h: 100 }
            }
          ]
        }
      },
      variants: [
        {
          id: "variant-delta-default",
          widgetType: "delta",
          templateId: "delta-vantare-default",
          themeId: "vantare-racing",
          name: "delta Default"
        },
        {
          id: "variant-relative-default",
          widgetType: "relative",
          templateId: "relative-vantare-default",
          themeId: "vantare-racing",
          name: "relative Default"
        },
        {
          id: "variant-standings-default",
          widgetType: "standings",
          templateId: "standings-vantare-default",
          themeId: "vantare-racing",
          name: "standings Default"
        }
      ]
    }
  }
];

export function cloneRecommendedProfile(profile: RecommendedProfile, name: string): ProfileConfig {
  const safeName = name.trim() || `${profile.name} Copy`;
  const slug = safeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const clone = structuredClone(profile.profile);
  clone.id = `custom-${slug || profile.id}`;
  clone.name = safeName;
  clone.source = {
    kind: "recommended",
    profileId: profile.id,
    name: profile.name,
  };
  return clone;
}
