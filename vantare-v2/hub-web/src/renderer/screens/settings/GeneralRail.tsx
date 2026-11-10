import { useDiagnostics } from "../../app/DiagnosticsState";
import { t } from "../../i18n/es";
import { generalRailText as text } from "../../i18n/settings-frame.es";
import { Button } from "../../ui/Button";
import { Keycap } from "../../ui/Data";
import {
  RailBlock,
  RailShortcut,
  RailVersion,
  StatusAnnouncement,
} from "../../ui/Frame";
import { ActionGroup } from "../../ui/ShellLayout";
export function GeneralRail({ onUpdates }: { onUpdates: () => void }) {
  const { query, prepare, copy } = useDiagnostics({ notifyCopied: false });
  return (
    <>
      <RailBlock title={text.preferences} icon="v-gauge">
        <p>{text.preferencesHelp}</p>
      </RailBlock>
      <RailBlock title={t("shell.version")} icon="v-download">
        <RailVersion>{query.data?.version ?? "—"}</RailVersion>
        <Button size="sm" onClick={onUpdates}>
          {t("settings.updates")}
        </Button>
      </RailBlock>
      <RailBlock title={t("settings.diagnostics")} icon="v-monitor">
        <ActionGroup>
          <Button
            variant="primary"
            busy={prepare.isPending}
            disabled={!query.data}
            onClick={() => prepare.mutate()}
          >
            {t("diagnostics.prepare")}
          </Button>
          <Button
            size="sm"
            busy={copy.isPending}
            disabled={!query.data?.report}
            onClick={() => copy.mutate()}
          >
            {t("diagnostics.copy")}
          </Button>
        </ActionGroup>
      </RailBlock>
      <RailBlock title={text.shortcuts} icon="v-keys">
        <RailShortcut label={text.launch}>
          <Keycap>{text.launchKey}</Keycap>
        </RailShortcut>
        <RailShortcut label={text.search}>
          <Keycap>{text.searchKey}</Keycap>
        </RailShortcut>
        <RailShortcut label={text.collapse}>
          <Keycap>{text.collapseKey}</Keycap>
        </RailShortcut>
      </RailBlock>
      {copy.isSuccess && (
        <StatusAnnouncement>{t("diagnostics.copied")}</StatusAnnouncement>
      )}
    </>
  );
}
