import type {
  HomeView,
  LauncherView,
} from "../../../contract/generated/contract";

export interface FavoriteApp {
  id: string;
  name: string;
  key: string;
}
export function favoriteApps(
  home: HomeView | undefined,
  launcher: LauncherView | undefined,
): FavoriteApp[] {
  if (
    !home ||
    home.protected ||
    !launcher ||
    launcher.protected ||
    home.revision !== launcher.revision
  )
    return [];
  const profile = launcher.profiles.find(
    (profile) => profile.id === home.favorite,
  );
  const occurrences = new Map<string, number>();
  return (
    profile?.apps.map((id) => {
      const occurrence = (occurrences.get(id) ?? 0) + 1;
      occurrences.set(id, occurrence);
      return {
        id,
        key: `${id}:${occurrence}`,
        name: launcher.apps.find((app) => app.id === id)?.name ?? id,
      };
    }) ?? []
  );
}
