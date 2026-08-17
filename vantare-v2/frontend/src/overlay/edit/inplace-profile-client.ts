import type { ProfileDocumentV3 } from "../core/profile-document";
import {
  createStudioProfileClient,
  type StudioEventTransport,
  type StudioProfileClient,
} from "../../hub/overlay-studio/state/studio-profile-client";

export type InPlaceProfileClientInput = {
  document: ProfileDocumentV3;
  revision: string;
  transport: StudioEventTransport;
};

/**
 * Cliente de perfil del modo edicion in-place: load() resuelve desde memoria
 * (sin round-trip) y save() emite exclusivamente overlay:edit-layout:save con
 * la misma correlacion, timeout y cleanup que el cliente del Hub. Nunca emite
 * studio:profile:save (que recrearia la ventana del overlay).
 */
export function createInPlaceProfileClient(input: InPlaceProfileClientInput): StudioProfileClient {
  const { document, revision, transport } = input;
  const delegate = createStudioProfileClient(transport, {
    saveRequestEvent: "overlay:edit-layout:save",
  });

  return {
    load(): Promise<{ document: ProfileDocumentV3; revision: string }> {
      return Promise.resolve({
        document: structuredClone(document),
        revision,
      });
    },
    save(saveInput) {
      return delegate.save(saveInput);
    },
  };
}
