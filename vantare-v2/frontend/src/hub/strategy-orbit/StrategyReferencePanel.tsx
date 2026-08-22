import { useEffect, useState } from "react";
import type { StrategyApplicationClient, StrategyEventV2, StrategyReferenceCatalogResultV1 } from "../../strategy/strategy-application-client";
import { Button, Chip, Surface } from "../../ui/orbit";
import type { StrategyEventRecord } from "./strategy-events-store";
import { applyReferenceProfile, applyReferenceStrategy, loadReferenceCatalog } from "./strategy-reference-catalog";

export function StrategyReferencePanel({ client, event, existing, repositoryVersion, onSaved, t }: {
  client: StrategyApplicationClient<unknown>;
  event: StrategyEventRecord;
  existing?: StrategyEventV2;
  repositoryVersion: number;
  onSaved: (event: StrategyEventV2, repositoryVersion: number) => void;
  t: (key: string) => string;
}) {
  const [catalog, setCatalog] = useState<StrategyReferenceCatalogResultV1 | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [used, setUsed] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    let current = true;
    void loadReferenceCatalog(client, repositoryVersion).then((value) => { if (current) setCatalog(value ?? null); }, () => { if (current) setCatalog({ source: "empty", warning: "unavailable", catalog: { contractVersion: "", source: { minimumCohort: 0 }, combinations: [] } }); });
    return () => { current = false; };
  }, [client, repositoryVersion]);

  const save = async (key: string, action: () => Promise<StrategyEventV2>) => {
    setBusy(key);
    setSaveFailed(false);
    try {
      const saved = await action();
      setUsed(key);
      onSaved(saved, repositoryVersion + 1);
    } catch {
      setSaveFailed(true);
    } finally {
      setBusy(null);
    }
  };
  const combinations = catalog?.catalog.combinations ?? [];
  return (
    <Surface className="orbit-reference" data-testid="orbit-reference" meta={t("strategy.reference.lead")} title={t("strategy.reference.title")}>
      {catalog?.warning ? <p className="orbit-reference__warning" role="alert">{t(`strategy.reference.warning.${catalog.warning}`)}</p> : null}
      {saveFailed ? <p className="orbit-reference__warning" role="alert">{t("strategy.reference.saveError")}</p> : null}
      {combinations.length === 0 ? <p>{t("strategy.reference.empty")}</p> : combinations.map((combination) => (
        <article className="orbit-reference__combination" key={combination.combinationId}>
          <h4>{combination.combinationId} <Chip caseNormal>{t("strategy.reference.badge")}</Chip></h4>
          {combination.referenceProfile ? (
            <div className="orbit-reference__item">
              <div><b>{t("strategy.reference.profile")} <Chip caseNormal>{t("strategy.reference.badge")}</Chip></b><span>k={combination.referenceProfile.sample.contributors} · {combination.referenceProfile.sample.sessions} {t("strategy.reference.sessions")}</span></div>
              <Button disabled={busy !== null} onClick={() => void save(`profile:${combination.combinationId}`, () => applyReferenceProfile(client, repositoryVersion, existing, event, combination))} size="sm" variant="ghost">{used === `profile:${combination.combinationId}` ? t("strategy.reference.used") : t("strategy.reference.use")}</Button>
            </div>
          ) : null}
          {combination.strategies.map((strategy) => {
            const key = `strategy:${strategy.clusterDigest}`;
            return <div className="orbit-reference__item" key={strategy.clusterDigest}>
              <div><b>{t("strategy.reference.strategy")} #{strategy.rank} <Chip caseNormal>{t("strategy.reference.badge")}</Chip></b><span>k={strategy.sample.contributors} · {strategy.representative.stintCount} {t("strategy.reference.stints")}</span></div>
              <Button disabled={busy !== null} onClick={() => void save(key, () => applyReferenceStrategy(client, repositoryVersion, existing, event, strategy))} size="sm" variant="ghost">{used === key ? t("strategy.reference.used") : t("strategy.reference.use")}</Button>
            </div>;
          })}
        </article>
      ))}
    </Surface>
  );
}
