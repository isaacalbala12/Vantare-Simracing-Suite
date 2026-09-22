/**
 * Product name for the design system previously described as Functional in
 * implementation-facing code.
 *
 * `vantare-functional` is intentionally still the persisted/public ID. Go,
 * saved profiles, memories, official design IDs, and existing Workshop links
 * depend on it, so changing that value would be a data migration rather than
 * a naming cleanup.
 */
export const EFFICIENCY_SYSTEM_NAME = "Efficiency" as const;
export const EFFICIENCY_SYSTEM_ID = "vantare-functional" as const;

const SUPPORTED_DESIGN_SYSTEM_IDS = [
  "vantare-original",
  "vantare-crystal",
  "vantare-endurance",
  EFFICIENCY_SYSTEM_ID,
  "vantare-iracing",
] as const;

export type DesignSystemId = (typeof SUPPORTED_DESIGN_SYSTEM_IDS)[number];

const DESIGN_SYSTEM_ID_ALIASES = {
  "vantare-original": "vantare-original",
  "vantare-crystal": "vantare-crystal",
  "vantare-endurance": "vantare-endurance",
  "vantare-iracing": "vantare-iracing",
  efficiency: EFFICIENCY_SYSTEM_ID,
  "vantare-efficiency": EFFICIENCY_SYSTEM_ID,
  functional: EFFICIENCY_SYSTEM_ID,
  "vantare-functional": EFFICIENCY_SYSTEM_ID,
} as const satisfies Readonly<Record<string, DesignSystemId>>;

/** Input spellings accepted at compatibility boundaries. */
export type DesignSystemIdAlias = keyof typeof DESIGN_SYSTEM_ID_ALIASES;

/**
 * Resolves a user-facing or historical spelling to the persisted system ID.
 * IDs are ASCII and case-insensitive at input boundaries, while output is
 * always the stable legacy ID used by the public profile contract.
 */
export function normalizeDesignSystemId(value: unknown): DesignSystemId | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const key = value.trim().toLowerCase();
  return Object.hasOwn(DESIGN_SYSTEM_ID_ALIASES, key) ? DESIGN_SYSTEM_ID_ALIASES[key as DesignSystemIdAlias] : undefined;
}

export function isSupportedDesignSystemId(value: unknown): value is DesignSystemId {
  return typeof value === "string" && SUPPORTED_DESIGN_SYSTEM_IDS.includes(value as DesignSystemId);
}

export function isEfficiencySystem(value: unknown): boolean {
  return normalizeDesignSystemId(value) === EFFICIENCY_SYSTEM_ID;
}
