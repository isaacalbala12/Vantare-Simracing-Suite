/**
 * Los "no volver a preguntar" del Studio.
 *
 * Viven en localStorage y no en el documento del perfil: son decisiones de la
 * persona que edita, no del overlay, y deben sobrevivir a cambiar de perfil.
 * La ausencia de la clave significa "preguntar", asi que una instalacion nueva
 * -- o un storage que lanza al leerse -- siempre confirma.
 */
export const DELETE_WIDGET_CONFIRM_STORAGE_KEY = "vantare.studio.deleteWidgetConfirm";

const DISABLED_VALUE = "off";

function resolveStorage(storage: Storage | null | undefined): Storage | null {
  if (storage !== undefined) {
    return storage;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readConfirmEnabled(storageKey: string, storage?: Storage | null): boolean {
  const store = resolveStorage(storage);
  if (!store) {
    return true;
  }
  try {
    return store.getItem(storageKey) !== DISABLED_VALUE;
  } catch {
    return true;
  }
}

export function writeConfirmEnabled(
  storageKey: string,
  enabled: boolean,
  storage?: Storage | null,
): void {
  const store = resolveStorage(storage);
  if (!store) {
    return;
  }
  try {
    if (enabled) {
      store.removeItem(storageKey);
      return;
    }
    store.setItem(storageKey, DISABLED_VALUE);
  } catch {
    // Un storage lleno o bloqueado no puede tumbar un borrado.
  }
}
