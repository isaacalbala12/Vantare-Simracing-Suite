import { useSyncExternalStore } from "react";
import { listWallpapers, subscribeWallpapers, type StudioWallpaper } from "./studio-wallpapers";

/** Biblioteca de fondos propios, viva: toolbar y lienzo leen la misma lista. */
export function useWallpapers(): StudioWallpaper[] {
  return useSyncExternalStore(subscribeWallpapers, listWallpapers, listWallpapers);
}
