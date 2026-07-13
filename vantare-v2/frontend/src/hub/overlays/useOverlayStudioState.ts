import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import type { ProfileEntry } from "../state/overlay-workbench";
import { createDefaultWidget } from "../../lib/widget-factory";

type ProfileLoadedEvent = {
  data: unknown;
};

// Wails v3 emits payloads as an array of arguments to the JS runtime.
const getPayload = <T,>(event: { data: unknown }): T => {
  return (Array.isArray(event.data) ? event.data[0] : event.data) as T;
};

export type SaveState = "idle" | "saving" | "saved" | "error";

type UseOverlayStudioStateOptions = {
  autosave?: boolean;
};

export function useOverlayStudioState(options: UseOverlayStudioStateOptions = {}) {
  const { autosave = true } = options;
  const [profile, setProfile] = useState<ProfileConfig | null>(null);
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [dirty, setDirty] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProfileConfig[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const profileRef = useRef<ProfileConfig | null>(null);
  const pendingAutosaveRef = useRef(false);
  const MAX_HISTORY = 50;

  const selectedWidget = useMemo(() => {
    return profile?.widgets.find((widget) => widget.id === selectedWidgetId) ?? profile?.widgets[0] ?? null;
  }, [profile, selectedWidgetId]);

  const loadProfile = useCallback((loaded: ProfileConfig) => {
    profileRef.current = loaded;
    setProfile(loaded);
    setHistory([loaded]);
    setHistoryIndex(0);
    setSelectedWidgetId((current) => current ?? loaded.widgets[0]?.id ?? null);
    setDirty(false);
    setSaveState("idle");
    setLastError(null);
  }, []);

  useEffect(() => {
    const unsubProfiles = Events.On("hub:profiles", (event: { data: unknown }) => {
      const data = getPayload<{ profiles?: ProfileEntry[] }>(event);
      setProfiles(data?.profiles ?? []);
    });

    const unsubCreated = Events.On("hub:profile-created", () => {
      Events.Emit("hub:list");
    });

    const unsubLoaded = Events.On("profile:loaded", (event: ProfileLoadedEvent) => {
      const data = getPayload<{ profile: ProfileConfig }>(event);
      if (data?.profile) loadProfile(data.profile);
    });

    const unsubSaved = Events.On("layout:saved", () => {
      setSaveState("saved");
      setDirty(false);
      setLastError(null);
    });

    const unsubError = Events.On("hub:error", (event: { data: unknown }) => {
      const data = getPayload<{ message?: string }>(event);
      setSaveState("error");
      setLastError(data?.message ?? "Error del hub");
    });

    Events.Emit("hub:list");
    Events.Emit("profile:request");

    return () => {
      unsubProfiles();
      unsubCreated();
      unsubLoaded();
      unsubSaved();
      unsubError();
    };
  }, [loadProfile]);

  const updateDraft = useCallback((nextProfile: ProfileConfig) => {
    profileRef.current = nextProfile;
    setHistory((previous) => {
      const base = previous.slice(0, historyIndex + 1);
      const next = [...base, nextProfile];
      return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
    });
    setHistoryIndex((previous) => previous + 1);
    setProfile(nextProfile);
    setDirty(true);
    setSaveState("idle");
    setLastError(null);
  }, [historyIndex]);

  const updateWidget = useCallback((nextWidget: WidgetConfig) => {
    const current = profileRef.current;
    if (!current) return;
    updateDraft({
      ...current,
      widgets: current.widgets.map((widget) => widget.id === nextWidget.id ? nextWidget : widget),
    });
  }, [updateDraft]);

  const addWidget = useCallback((type: string) => {
    const current = profileRef.current;
    if (!current) return;
    const newWidget = createDefaultWidget(type, current.widgets);

    const nextWidgets = [...current.widgets, newWidget];
    const nextProfile: ProfileConfig = {
      ...current,
      widgets: nextWidgets,
    };

    if (current.layouts) {
      nextProfile.layouts = {
        ...current.layouts,
      };
      if (current.layouts.general) {
        nextProfile.layouts.general = {
          ...current.layouts.general,
          widgets: [...(current.layouts.general.widgets ?? []), newWidget],
        };
      }
    }

    updateDraft(nextProfile);
    setSelectedWidgetId(newWidget.id);
  }, [updateDraft]);

  const saveProfile = useCallback(() => {
    const current = profileRef.current;
    if (!current || !dirty) return;
    setSaveState("saving");
    setLastError(null);
    Events.Emit("layout:save", { widgets: current.widgets, variants: current.variants });
  }, [dirty]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    const nextProfile = history[nextIndex];
    profileRef.current = nextProfile;
    setHistoryIndex(nextIndex);
    setProfile(nextProfile);
    setDirty(true);
    setSaveState("idle");
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const nextProfile = history[nextIndex];
    profileRef.current = nextProfile;
    setHistoryIndex(nextIndex);
    setProfile(nextProfile);
    setDirty(true);
    setSaveState("idle");
  }, [history, historyIndex]);

  useEffect(() => {
    if (!autosave || !dirty) return;
    pendingAutosaveRef.current = true;
    const id = window.setTimeout(() => {
      pendingAutosaveRef.current = false;
      saveProfile();
    }, 800);
    return () => {
      window.clearTimeout(id);
      if (pendingAutosaveRef.current) saveProfile();
    };
  }, [autosave, dirty, profile, saveProfile]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key === "s") {
        event.preventDefault();
        saveProfile();
      } else if (event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (event.key === "y" || (event.key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, saveProfile, undo]);

  return {
    profile,
    profiles,
    selectedWidget,
    selectedWidgetId,
    saveState,
    dirty,
    lastError,
    canUndo: historyIndex > 0,
    canRedo: historyIndex >= 0 && historyIndex < history.length - 1,
    setSelectedWidgetId,
    updateDraft,
    updateWidget,
    addWidget,
    saveProfile,
    undo,
    redo,
  };
}
