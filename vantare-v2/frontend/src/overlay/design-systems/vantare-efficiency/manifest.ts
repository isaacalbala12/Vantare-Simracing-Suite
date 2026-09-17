import { vantareFunctionalManifest } from "../vantare-functional/manifest";

/**
 * Canonical code entry point for the Efficiency design system.
 *
 * The manifest object remains the existing one so the renderer, settings,
 * migrations, and public ID are byte-for-byte unchanged. Its `id` is kept as
 * `vantare-functional` for profile/URL/Go compatibility.
 */
export const vantareEfficiencyManifest = vantareFunctionalManifest;

/** @deprecated Use `vantareEfficiencyManifest`; kept for old imports. */
export { vantareFunctionalManifest };
