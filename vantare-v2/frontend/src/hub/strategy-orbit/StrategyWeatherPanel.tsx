import { Button, Input, Note, Select } from "../../ui/orbit";
import type {
  StrategyOrbitWeatherResultV1,
  StrategyWeatherNodeV1,
  StrategyWeatherSkyV1,
  StrategyWeightedWeatherScenarioV1,
} from "../../strategy/strategy-application-client";
import { createManualWeatherScenario } from "./strategy-weather-scenarios";

type StrategyWeatherPanelProps = {
  eventId: string;
  combinationId?: string;
  scenarios: readonly StrategyWeightedWeatherScenarioV1[];
  result?: StrategyOrbitWeatherResultV1;
  saving: "idle" | "saving" | "error";
  onSave(scenarios: readonly StrategyWeightedWeatherScenarioV1[]): void;
  t(key: string): string;
};

const skyValues: readonly StrategyWeatherSkyV1[] = ["clear", "light_clouds", "partially_cloudy", "mostly_cloudy", "overcast", "drizzle"];

function numberAt(value: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function replaceScenario(
  scenarios: readonly StrategyWeightedWeatherScenarioV1[],
  index: number,
  update: (scenario: StrategyWeightedWeatherScenarioV1) => StrategyWeightedWeatherScenarioV1,
): readonly StrategyWeightedWeatherScenarioV1[] {
  return scenarios.map((scenario, candidate) => candidate === index ? update(scenario) : scenario);
}

export function StrategyWeatherPanel({ eventId, combinationId, scenarios, result, saving, onSave, t }: StrategyWeatherPanelProps) {
  const updateNode = (scenarioIndex: number, nodeIndex: number, change: Partial<StrategyWeatherNodeV1>) => {
    onSave(replaceScenario(scenarios, scenarioIndex, (weighted) => ({
      ...weighted,
      scenario: {
        ...weighted.scenario,
        generatedAt: new Date().toISOString(),
        nodes: weighted.scenario.nodes.map((node, index) => index === nodeIndex ? { ...node, ...change } : node) as unknown as StrategyWeightedWeatherScenarioV1["scenario"]["nodes"],
      },
    })));
  };
  return (
    <div className="orbit-weather" data-testid="orbit-strategy-weather">
      <div className="orbit-weather__head">
        <div><b>{t("strategy.weather.title")}</b><span>{t("strategy.weather.manualLead")}</span></div>
        <Button disabled size="sm" variant="ghost">{t("strategy.weather.capture")}</Button>
      </div>
      <small className="orbit-weather__capture-copy">{t("strategy.weather.captureUnavailable")}</small>
      {scenarios.length === 0 ? <Note title={t("strategy.weather.emptyTitle")}>{t("strategy.weather.empty")}</Note> : null}
      {scenarios.map((weighted, scenarioIndex) => {
        const plan = result?.plans.find((candidate) => candidate.scenarioId === weighted.scenario.scenarioId);
        return (
          <article className="orbit-weather__scenario" data-testid={`orbit-weather-scenario-${scenarioIndex}`} key={weighted.scenario.scenarioId}>
            <header>
              <b>{t("strategy.weather.scenario")} {scenarioIndex + 1}</b>
              <label>
                <span>{t("strategy.weather.weight")}</span>
                <Input aria-label={t("strategy.weather.weight")} defaultValue={String(weighted.weight)} inputMode="decimal" numeric onBlur={(event) => onSave(replaceScenario(scenarios, scenarioIndex, (current) => ({ ...current, weight: numberAt(event.currentTarget.value, current.weight, 0.01, 100) })))} />
              </label>
              <Button aria-label={`${t("strategy.weather.remove")} ${scenarioIndex + 1}`} onClick={() => onSave(scenarios.filter((_, index) => index !== scenarioIndex))} size="sm" variant="danger">{t("strategy.weather.remove")}</Button>
            </header>
            <div className="orbit-weather__nodes">
              {weighted.scenario.nodes.map((node, nodeIndex) => (
                <div data-testid={`orbit-weather-node-${scenarioIndex}-${nodeIndex}`} key={node.progress}>
                  <b>{t(`strategy.weather.node.${node.progress}`)}</b>
                  <label><span>{t("strategy.weather.rain")}</span><Input aria-label={t("strategy.weather.rain")} defaultValue={String(node.rainChance)} inputMode="decimal" numeric onBlur={(event) => updateNode(scenarioIndex, nodeIndex, { rainChance: numberAt(event.currentTarget.value, node.rainChance, 0, 100) })} unit="%" /></label>
                  <label><span>{t("strategy.weather.sky")}</span><Select label={t("strategy.weather.sky")} native onChange={(sky) => updateNode(scenarioIndex, nodeIndex, { sky })} options={skyValues.map((sky) => ({ value: sky, label: t(`strategy.weather.sky.${sky}`) }))} value={node.sky} /></label>
                  <label><span>{t("strategy.weather.air")}</span><Input aria-label={t("strategy.weather.air")} defaultValue={String(node.airTempC)} inputMode="decimal" numeric onBlur={(event) => updateNode(scenarioIndex, nodeIndex, { airTempC: numberAt(event.currentTarget.value, node.airTempC, -50, 80) })} unit="°C" /></label>
                  <label><span>{t("strategy.weather.track")}</span><Input aria-label={t("strategy.weather.track")} defaultValue={String(node.trackTempC)} inputMode="decimal" numeric onBlur={(event) => updateNode(scenarioIndex, nodeIndex, { trackTempC: numberAt(event.currentTarget.value, node.trackTempC, -50, 100) })} unit="°C" /></label>
                </div>
              ))}
            </div>
            {plan ? (
              <div className="orbit-weather__plan">
                <b>{t("strategy.weather.plan")}</b>
                <span>{plan.stints.map((stint) => `${stint.laps}v`).join(" + ")} · {plan.stops} {t("strategy.weather.stops")} · {plan.totalSeconds.toFixed(1)} s</span>
                <details open>
                  <summary>{t("strategy.weather.timeline")}</summary>
                  <div>{plan.timeline.map((condition) => <span key={condition.lap}>V{condition.lap} · {t(`strategy.weather.bucket.${condition.bucket}`)} · {condition.rainChance.toFixed(0)}%</span>)}</div>
                </details>
              </div>
            ) : null}
          </article>
        );
      })}
      <Button disabled={saving === "saving" || scenarios.length >= 16} onClick={() => onSave([...scenarios, createManualWeatherScenario(eventId, combinationId ?? `manual:${eventId}`, `weather-${Date.now()}`)])} size="sm" variant="primary">{t("strategy.weather.add")}</Button>
      {saving === "error" ? <p role="alert">{t("strategy.weather.saveError")}</p> : null}
      {result ? (
        <article className="orbit-weather__robust" data-testid="orbit-weather-robust">
          <span className="orbit-eyebrow">{t("strategy.weather.robust")}</span>
          <b>{t("strategy.weather.minimax")}</b>
          <div><span>{t("strategy.weather.maxRegret")}</span><strong>{result.robust.maxRegretSeconds.toFixed(1)} s</strong></div>
          <div><span>{t("strategy.weather.expectedLoss")}</span><strong>{result.robust.weightedExpectedLossSeconds.toFixed(1)} s</strong></div>
          <small>{result.robust.stints.map((stint) => `${stint.laps}v`).join(" + ")}</small>
        </article>
      ) : null}
    </div>
  );
}
