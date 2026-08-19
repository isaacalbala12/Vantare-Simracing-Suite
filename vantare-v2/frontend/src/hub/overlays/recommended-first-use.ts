import { cloneRecommendedProfile, type RecommendedProfile } from "./recommended-profiles";

type Emit = (name: string, data?: unknown) => void;

export type RunRecommendedFirstUseParams = {
  profile: RecommendedProfile;
  name: string;
  emit: Emit;
  resolveFile: (id: string) => Promise<string | null>;
  onSuccess?: (id: string) => void;
  /** Recibe una clave i18n del catálogo `hub-shared`, no una cadena literal. */
  onError?: (messageKey: string) => void;
};

export async function runRecommendedFirstUse(params: RunRecommendedFirstUseParams): Promise<void> {
  const { profile, name, emit, resolveFile, onSuccess, onError } = params;
  const trimmed = name.trim();
  if (!trimmed) {
    onError?.("overlays.firstUse.emptyName");
    return;
  }

  const cloned = cloneRecommendedProfile(profile, trimmed);
  if (!cloned.id) {
    onError?.("overlays.firstUse.invalidClone");
    return;
  }
  const clonedId = cloned.id;
  emit("hub:save-own-copy", { profile: cloned });
  emit("hub:list");

  const file = await resolveFile(clonedId);
  if (!file) {
    onError?.("overlays.firstUse.fileNotFound");
    return;
  }

  emit("hub:set-active", { id: clonedId, file });
  emit("overlay:start-active");
  onSuccess?.(clonedId);
}
