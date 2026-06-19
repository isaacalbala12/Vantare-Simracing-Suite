import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { ProfileConfig, WidgetConfig } from "../../lib/profile";
import type { ProfileEntry } from "../state/overlay-workbench";

type ProfileLoadedEvent = {
  data: {
    profile: ProfileConfig;
  };
};

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useOverlayStudioState() {
  const [profile, setProfile] = useState<ProfileConfig | null>(null);
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [dirty, setDirty] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProfileConfig[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const profileRef = useRef<ProfileConfig | null>(null);

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
      const data = event.data as { profiles?: ProfileEntry[] };
      setProfiles(data.profiles ?? []);
    });

    const unsubCreated = Events.On("hub:profile-created", () => {
      Events.Emit("hub:list");
    });

    const unsubLoaded = Events.On("profile:loaded", (event: ProfileLoadedEvent) => {
      loadProfile(event.data.profile);
    });

    const unsubSaved = Events.On("layout:saved", () => {
      setSaveState("saved");
      setDirty(false);
      setLastError(null);
    });

    const unsubError = Events.On("hub:error", (event: { data: unknown }) => {
      const data = event.data as { message?: string };
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
      return [...base, nextProfile];
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

  const saveProfile = useCallback(() => {
    const current = profileRef.current;
    if (!current || !dirty) return;
    setSaveState("saving");
    setLastError(null);
    Events.Emit("layout:save", { widgets: current.widgets });
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
    if (!dirty) return;
    const id = window.setTimeout(() => saveProfile(), 800);
    return () => window.clearTimeout(id);
  }, [dirty, profile, saveProfile]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
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
    saveProfile,
    undo,
    redo,
  };
}
