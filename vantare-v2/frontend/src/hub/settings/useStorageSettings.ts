import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";

/** One directory Vantare owns on this machine. */
export type StorageLocation = {
  key: string;
  path: string;
  bytes: number;
  files: number;
  exists: boolean;
  /** The backend decides what may be emptied; the UI does not guess. */
  clearable: boolean;
};

export type StorageSummary = {
  locations: StorageLocation[];
  totalBytes: number;
};

const EMPTY: StorageSummary = { locations: [], totalBytes: 0 };

/**
 * What Vantare keeps on disk.
 *
 * Every action sends a location key, never a path, and the backend answers
 * with a fresh measurement -- including after a refusal, so the page always
 * shows what is really there rather than what we asked for.
 */
export function useStorageSettings() {
  const [summary, setSummary] = useState<StorageSummary>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const handlers: (() => void)[] = [];

    handlers.push(
      Events.On("storage", (event: { data: StorageSummary }) => {
        if (event.data && Array.isArray(event.data.locations)) {
          setSummary(event.data);
          setError(null);
          setLoaded(true);
        }
      }),
    );

    handlers.push(
      Events.On("storage:error", (event: { data: { message?: string } }) => {
        setError(event.data?.message ?? "");
      }),
    );

    Events.Emit("storage:get");

    return () => {
      handlers.forEach((handler) => handler?.());
    };
  }, []);

  return {
    summary,
    error,
    loaded,
    reveal: (key: string) => Events.Emit("storage:reveal", { key }),
    clear: (key: string) => Events.Emit("storage:clear", { key }),
    refresh: () => Events.Emit("storage:get"),
  };
}

/**
 * Sizes are shown in the units people read disks in. Below a kilobyte the
 * exact number is noise, so it rounds to "0 KB" rather than showing bytes.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
