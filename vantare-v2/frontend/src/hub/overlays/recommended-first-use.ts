import { cloneRecommendedProfile, type RecommendedProfile } from "./recommended-profiles";

type Emit = (name: string, data?: unknown) => void;

export type RunRecommendedFirstUseParams = {
  profile: RecommendedProfile;
  name: string;
  emit: Emit;
  resolveFile: (id: string) => Promise<string | null>;
  onSuccess?: (id: string) => void;
  onError?: (message: string) => void;
};

export async function runRecommendedFirstUse(params: RunRecommendedFirstUseParams): Promise<void> {
  const { profile, name, emit, resolveFile, onSuccess, onError } = params;
  const trimmed = name.trim();
  if (!trimmed) {
    onError?.("El nombre del perfil no puede estar vacío.");
    return;
  }

  const cloned = cloneRecommendedProfile(profile, trimmed);
  emit("hub:save-own-copy", { profile: cloned });
  emit("hub:list");

  const file = await resolveFile(cloned.id);
  if (!file) {
    onError?.("No se encontró el archivo del perfil recién creado.");
    return;
  }

  emit("hub:set-active", { id: cloned.id, file });
  emit("overlay:start-active");
  onSuccess?.(cloned.id);
}
