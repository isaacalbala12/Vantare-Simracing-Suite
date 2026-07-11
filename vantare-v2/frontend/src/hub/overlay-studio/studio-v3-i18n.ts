export const STUDIO_V3_I18N_PREFIX = "studio.v3.";

export const STUDIO_WIDGET_ACCESS_MESSAGE_KEY = "studio.v3.access.widgetMutationDenied";
export const STUDIO_PREMIUM_SAVE_DENIED_KEY = "studio.v3.access.premiumSaveDenied";
export const OFFICIAL_DESIGNS_SECTION_LABEL_KEY = "studio.v3.design.officialSection.title";

export function isStudioV3MessageKey(value: string): boolean {
  return value.startsWith(STUDIO_V3_I18N_PREFIX);
}

export function resolveStudioV3Text(
  value: string,
  t: (key: string) => string,
): string {
  return isStudioV3MessageKey(value) ? t(value) : value;
}