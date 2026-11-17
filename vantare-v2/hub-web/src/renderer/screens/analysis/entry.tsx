import { useQueryClient } from "@tanstack/react-query";
import { useAnalysis } from "../../app/AnalysisState";
import { SectionChrome, SectionPanel } from "../../app/SectionChrome";
import { useSettings } from "../../app/SettingsState";
import { useUi } from "../../app/UiState";
import { analysisText as t } from "../../i18n/analysis.es";
import { comparisonText as ct } from "../../i18n/comparison.es";
import {
  AnalysisCatalog,
  AnalysisNotice,
  AnalysisRail,
} from "../../ui/analysis/Analysis";
import { Comparison } from "../../ui/analysis/Comparison";
import { ComparisonRail } from "../../ui/analysis/ComparisonRail";
import { CompareAction } from "../../ui/analysis/LapChoices";
import { AnalysisLaps } from "../../ui/analysis/RecordingDetail";
import { Button } from "../../ui/Button";
import { SectionPageHeader } from "../../ui/Frame";
export default function Analysis({
  clock = Date.now,
  timeZone,
}: {
  clock?: () => number;
  timeZone?: string;
}) {
  const state = useAnalysis();
  const settings = useSettings();
  const navigate = useUi((s) => s.navigate);
  const cache = useQueryClient();
  const enabled = settings.view?.general.grabacion ?? true;
  const current = state.compareView
    ? "compare"
    : state.selected
      ? "laps"
      : "recordings";
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
        tabs={[
          { id: "recordings", etiqueta: t.recordings, visible: true },
          {
            id: "laps",
            etiqueta: t.laps,
            visible: true,
            ariaDisabled: !state.selected,
            description: !state.selected ? t.openFirst : undefined,
          },
          {
            id: "compare",
            etiqueta: ct.tab,
            visible: true,
            ariaDisabled:
              !state.opened || state.pair?.a == null || state.pair.b == null,
            description:
              !state.opened || state.pair?.a == null || state.pair.b == null
                ? ct.selectFirst
                : undefined,
          },
          { id: "map", etiqueta: t.map, visible: true, ariaDisabled: true },
        ]}
        activeTab={current}
        onTabChange={(id) => {
          if (id === "recordings" && state.selected) state.controller?.load();
          if (id === "laps" && state.compareView) state.controller?.showLaps();
          if (id === "compare" && !state.compareView)
            state.controller?.compare();
        }}
        rail={
          state.compareView ? (
            <ComparisonRail state={state} controller={state.controller} />
          ) : (
            <>
              <AnalysisRail
                clock={clock}
                timeZone={timeZone}
                enabled={enabled}
                state={state}
                recording={state.rows.some((r) => r.recording)}
              />
              {state.opened && (
                <CompareAction
                  state={state}
                  controller={state.controller}
                  quick
                />
              )}
            </>
          )
        }
      />
      <SectionPanel activeTab={current}>
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
        ) : state.compareView ? (
          <Comparison
            state={state}
            controller={state.controller}
            clock={clock}
            timeZone={timeZone}
            enabled={enabled}
            updates={() => goSettings("updates")}
          />
        ) : state.selected ? (
          <AnalysisLaps
            clock={clock}
            timeZone={timeZone}
            state={state}
            controller={state.controller}
            enabled={enabled}
            updates={() => goSettings("updates")}
          />
        ) : (
          <AnalysisCatalog
            clock={clock}
            timeZone={timeZone}
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
