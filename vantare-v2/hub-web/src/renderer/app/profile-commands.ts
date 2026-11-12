import type { LauncherView } from "../../contract/generated/contract";
import { commandsText as text } from "../i18n/commands.es";
import type { PaletteCommand } from "../ui/CommandPalette";

export function profileCommands(
  view: LauncherView | undefined,
  blocked: string | undefined,
  launch: (profile: string, revision: string) => void,
): PaletteCommand[] {
  return (
    view?.profiles.map((profile) => {
      const reason =
        blocked ??
        (view.scanning
          ? text.scanning
          : !view.resident
            ? text.noResident
            : view.running
              ? text.running
              : profile.apps.length === 0
                ? text.noSteps
                : !profile.launchable
                  ? text.unavailable
                  : undefined);
      return {
        id: `launch-profile:${profile.id}`,
        label: text.launch(profile.name),
        icon: "v-launch",
        group: "actions",
        meta: reason ?? text.profile,
        trail: text.profile,
        disabled: !!reason,
        run: () => {
          if (!reason) launch(profile.id, view.revision);
        },
      };
    }) ?? []
  );
}
