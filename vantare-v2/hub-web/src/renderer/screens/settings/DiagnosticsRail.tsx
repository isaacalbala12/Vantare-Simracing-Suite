import { useDiagnostics } from "../../app/DiagnosticsState";
import { diagnosticsText as text } from "../../i18n/diagnostics.es";
import { t } from "../../i18n/es";
import { DiagnosticRailLayout } from "../../ui/DiagnosticRailLayout";
import { Textarea } from "../../ui/Forms";
import { RailBlock } from "../../ui/Frame";
export function DiagnosticsRail() {
  const { query } = useDiagnostics({
    notifyCopied: false,
    notifyErrors: false,
  });
  return (
    <DiagnosticRailLayout>
      <RailBlock title={t("diagnostics.report")} icon="v-monitor">
        <p>{text.reportHelp}</p>
      </RailBlock>
      <RailBlock title={text.team} icon="v-monitor">
        <p>{text.teamHelp}</p>
      </RailBlock>
      <RailBlock title={text.problems} icon="v-shield">
        <p>{text.problemsHelp}</p>
      </RailBlock>
      {query.data?.report && (
        <RailBlock title={text.content} icon="v-monitor">
          <Textarea
            label={t("diagnostics.preview")}
            readOnly
            value={query.data.report}
          />
        </RailBlock>
      )}
    </DiagnosticRailLayout>
  );
}
