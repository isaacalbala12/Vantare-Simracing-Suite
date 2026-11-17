import { useQueryClient } from "@tanstack/react-query";
import { useAnalysis } from "../../app/AnalysisState";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { useSettings } from "../../app/SettingsState";
import { useUi } from "../../app/UiState";
import { analysisText as t } from "../../i18n/analysis.es";
import {
  AnalysisCatalog,
  AnalysisNotice,
  AnalysisRail,
} from "../../ui/analysis/Analysis";
import { Button } from "../../ui/Button";
import { SectionPageHeader } from "../../ui/Frame";
export default function Analysis() {
  const state = useAnalysis();
  const settings = useSettings();
  const navigate = useUi((s) => s.navigate);
  const cache = useQueryClient();
  const enabled = settings.view?.general.grabacion ?? true;
  const goSettings = (target: string) => {
    cache.setQueryData(["settings", "target"], target);
    navigate("settings");
  };
  const denied =
    !state.access.analysis || !state.access.verified || state.access.blocked;
  return (
    <>
      <SectionChrome
        title={t.title}
        tabs={[{ id: "recordings", etiqueta: t.recordings, visible: true }]}
        activeTab="recordings"
        rail={
          <AnalysisRail
            enabled={enabled}
            recording={state.rows.some((r) => r.recording)}
          />
        }
      />
      <SectionPanel activeTab="recordings">
        {denied ? (
          <>
            <SectionPageHeader title={t.recordings} description={t.intro} />
            <AnalysisNotice
              icon="lock"
              title={
                state.access.verified && !state.access.blocked
                  ? t.denied
                  : t.signIn
              }
              help={
                state.access.verified && !state.access.blocked
                  ? t.deniedHelp
                  : t.signInHelp
              }
            >
              <Button variant="primary" onClick={() => goSettings("account")}>
                {t.account}
              </Button>
            </AnalysisNotice>
          </>
        ) : (
          <AnalysisCatalog
            state={state}
            controller={state.controller}
            enabled={enabled}
            settings={() => goSettings("privacy")}
          />
        )}
      </SectionPanel>
    </>
  );
}
