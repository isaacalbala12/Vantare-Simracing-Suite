import { useSyncExternalStore } from "react";
import {
  requestSettings as bridgeRequestSettings,
  saveSettings as bridgeSaveSettings,
  subscribeSettings as bridgeSubscribeSettings,
  subscribeSettingsSaved as bridgeSubscribeSettingsSaved,
  type SettingsSavedPayload,
  type Unsubscribe,
} from "./settings-events";
import type { AppSettings, NotificationSettings } from "./settings-contract";

/**
 * Store compartido del canal `settings` (ISA-1143 / issue #1147, fase 1).
 *
 * Antes cada consumidor abría su propio `Events.On` y copiaba el payload en
 * su estado local; ahora un único store escucha el puente una vez y reparte
 * canales granulares (`subscribeNotificationPreferences`,
 * `subscribeActiveOverlayProfileId`, `subscribeSettingsSaved`) que solo
 * despiertan a sus suscriptores cuando su slice cambia de verdad. Es el
 * mismo patrón que `hub/launcher/launcher-store-core.ts`, sin provider:
 * los consumidores viven repartidos por todo el árbol del hub y el store es
 * un singleton de módulo, como ya hace el fanout del puente.
 */

export type SettingsEventsLike = {
  subscribeSettings: (listener: (settings: AppSettings) => void) => Unsubscribe;
  subscribeSettingsSaved: (
    listener: (payload: SettingsSavedPayload | undefined) => void,
  ) => Unsubscribe;
  requestSettings: () => void;
  saveSettings: (payload: { requestId: string; settings: AppSettings }) => void;
};

export type SettingsStore = {
  /** Último payload `settings` tal cual llegó, o null antes del primero. */
  getSnapshot: () => AppSettings | null;
  /** Se dispara en cada evento `settings`. */
  subscribe: (listener: () => void) => Unsubscribe;
  /** Slice `notifications` con referencia estable mientras no cambie. */
  getNotificationPreferences: () => NotificationSettings;
  subscribeNotificationPreferences: (listener: () => void) => Unsubscribe;
  /** Slice `activeOverlayProfileId`; cadena vacía o ausente = null. */
  getActiveOverlayProfileId: () => string | null;
  subscribeActiveOverlayProfileId: (listener: () => void) => Unsubscribe;
  /** Último `settings-saved` recibido, o null si no ha llegado ninguno. */
  getSettingsSaved: () => SettingsSavedPayload | null;
  subscribeSettingsSaved: (listener: () => void) => Unsubscribe;
  requestSettings: () => void;
  saveSettings: (payload: { requestId: string; settings: AppSettings }) => void;
  start: () => void;
  stop: () => void;
};

const defaultEvents: SettingsEventsLike = {
  subscribeSettings: bridgeSubscribeSettings,
  subscribeSettingsSaved: bridgeSubscribeSettingsSaved,
  requestSettings: bridgeRequestSettings,
  saveSettings: bridgeSaveSettings,
};

const EMPTY_NOTIFICATIONS: NotificationSettings = Object.freeze({});

// Los opt-outs de notificación se comparan por valor: el objeto entrante es
// nuevo en cada evento `settings` y devolverlo tal cual repintaba a todo
// suscriptor del slice (ChainRunnerProvider envuelve el Hub entero).
export function sameNotificationSettings(
  a: NotificationSettings,
  b: NotificationSettings,
): boolean {
  return (
    Boolean(a.updatesMuted) === Boolean(b.updatesMuted) &&
    Boolean(a.launcherMuted) === Boolean(b.launcherMuted) &&
    Boolean(a.systemEnabled) === Boolean(b.systemEnabled)
  );
}

export function createSettingsStore(
  events: SettingsEventsLike = defaultEvents,
): SettingsStore {
  let settings: AppSettings | null = null;
  let notifications: NotificationSettings = EMPTY_NOTIFICATIONS;
  let activeOverlayProfileId: string | null = null;
  let settingsSaved: SettingsSavedPayload | null = null;
  let started = false;
  let detachEvents: Unsubscribe | null = null;

  const settingsSubscribers = new Set<() => void>();
  const notificationSubscribers = new Set<() => void>();
  const activeIdSubscribers = new Set<() => void>();
  const savedSubscribers = new Set<() => void>();

  const publish = (subscribers: Set<() => void>) => {
    subscribers.forEach((subscriber) => subscriber());
  };

  function ingestSettings(next: AppSettings): void {
    settings = next;

    const nextNotifications = next.notifications ?? EMPTY_NOTIFICATIONS;
    const notificationsChanged = !sameNotificationSettings(
      notifications,
      nextNotifications,
    );
    if (notificationsChanged) notifications = nextNotifications;

    const nextActiveId =
      typeof next.activeOverlayProfileId === "string" &&
      next.activeOverlayProfileId.length > 0
        ? next.activeOverlayProfileId
        : null;
    const activeIdChanged = nextActiveId !== activeOverlayProfileId;
    if (activeIdChanged) activeOverlayProfileId = nextActiveId;

    publish(settingsSubscribers);
    if (notificationsChanged) publish(notificationSubscribers);
    if (activeIdChanged) publish(activeIdSubscribers);
  }

  function ingestSaved(payload: SettingsSavedPayload | undefined): void {
    settingsSaved = payload ?? null;
    publish(savedSubscribers);
  }

  function hasSubscribers(): boolean {
    return (
      settingsSubscribers.size +
        notificationSubscribers.size +
        activeIdSubscribers.size +
        savedSubscribers.size >
      0
    );
  }

  function start(): void {
    if (started) return;
    started = true;
    const offSettings = events.subscribeSettings(ingestSettings);
    const offSaved = events.subscribeSettingsSaved(ingestSaved);
    detachEvents = () => {
      offSettings();
      offSaved();
    };
  }

  function stop(): void {
    if (!started) return;
    started = false;
    detachEvents?.();
    detachEvents = null;
    settings = null;
    notifications = EMPTY_NOTIFICATIONS;
    activeOverlayProfileId = null;
    settingsSaved = null;
  }

  function track(
    subscribers: Set<() => void>,
    listener: () => void,
  ): Unsubscribe {
    subscribers.add(listener);
    // La suscripción al puente es perezosa: el primer consumidor la instala
    // y el último la desmonta, igual que el fanout de `settings-events`.
    start();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      subscribers.delete(listener);
      if (!hasSubscribers()) stop();
    };
  }

  return {
    getSnapshot: () => settings,
    subscribe: (listener) => track(settingsSubscribers, listener),
    getNotificationPreferences: () => notifications,
    subscribeNotificationPreferences: (listener) =>
      track(notificationSubscribers, listener),
    getActiveOverlayProfileId: () => activeOverlayProfileId,
    subscribeActiveOverlayProfileId: (listener) =>
      track(activeIdSubscribers, listener),
    getSettingsSaved: () => settingsSaved,
    subscribeSettingsSaved: (listener) => track(savedSubscribers, listener),
    requestSettings: () => events.requestSettings(),
    saveSettings: (payload) => events.saveSettings(payload),
    start,
    stop,
  };
}

let defaultStore: SettingsStore | null = null;

/** Store de módulo compartido por todos los consumidores del hub. */
export function getSettingsStore(): SettingsStore {
  defaultStore ??= createSettingsStore();
  return defaultStore;
}

export function useSettingsSnapshot(): AppSettings | null {
  const store = getSettingsStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useActiveOverlayProfileId(): string | null {
  const store = getSettingsStore();
  return useSyncExternalStore(
    store.subscribeActiveOverlayProfileId,
    store.getActiveOverlayProfileId,
    store.getActiveOverlayProfileId,
  );
}

export function useSettingsSaved(): SettingsSavedPayload | null {
  const store = getSettingsStore();
  return useSyncExternalStore(
    store.subscribeSettingsSaved,
    store.getSettingsSaved,
    store.getSettingsSaved,
  );
}
