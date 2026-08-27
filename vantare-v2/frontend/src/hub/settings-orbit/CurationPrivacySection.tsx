import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { Button, Note, SubtleStatus, Surface } from "../../ui/orbit";
import {
  createCurationUploadClient,
  type CurationUploadSnapshot,
} from "../settings/curation-upload-client";

export const CURATION_CONSENT_TEXT_VERSION = "curation-consent.v1";

type CurationClient = ReturnType<typeof createCurationUploadClient>;
const defaultCurationClient = createCurationUploadClient();

export function CurationPrivacySection({ client = defaultCurationClient }: { client?: CurationClient }) {
  const { t, locale } = useI18n();
  const [snapshot, setSnapshot] = useState<CurationUploadSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (name: string, action: () => Promise<CurationUploadSnapshot>) => {
    setBusy(name);
    setError(null);
    try {
      setSnapshot(await action());
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String(reason.code) : "request_failed";
      setError(t(`settings.privacy.error.${code}`));
    } finally {
      setBusy((current) => current === name ? null : current);
    }
  }, [t]);

  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) void run("snapshot", client.snapshot);
    });
    return () => {
      current = false;
    };
  }, [client, run]);

  const active = snapshot?.consent.active === true;
  const pending = useMemo(() => snapshot?.queue.filter((item) => item.state !== "sent").length ?? 0, [snapshot]);
  const sent = useMemo(() => snapshot?.queue.filter((item) => item.state === "sent").length ?? 0, [snapshot]);

  return (
    <div className="orbit-set-privacy" data-testid="orbit-settings-privacy">
      <Surface aria-label={t("settings.privacy.consentTitle")} fill title={t("settings.privacy.consentTitle")}>
        <p>{t("settings.privacy.intro")}</p>
        <div className="orbit-set-privacy__columns">
          <div>
            <b>{t("settings.privacy.sharedTitle")}</b>
            <ul>
              <li>{t("settings.privacy.sharedDerived")}</li>
              <li>{t("settings.privacy.sharedWeek")}</li>
              <li>{t("settings.privacy.sharedAdmin")}</li>
            </ul>
          </div>
          <div>
            <b>{t("settings.privacy.neverTitle")}</b>
            <ul>
              <li>{t("settings.privacy.neverRaw")}</li>
              <li>{t("settings.privacy.neverIdentity")}</li>
              <li>{t("settings.privacy.neverVoice")}</li>
            </ul>
          </div>
        </div>
        <Note>{t("settings.privacy.pseudonymousNote")}</Note>
        <div className="orbit-set-privacy__actions">
          {!active ? (
            <Button disabled={busy !== null} onClick={() => void run("opt_in", () => client.optIn(CURATION_CONSENT_TEXT_VERSION))} variant="primary">
              {t("settings.privacy.optIn")}
            </Button>
          ) : (
            <Button disabled={busy !== null && busy !== "dispatch"} onClick={() => void run(snapshot?.paused ? "resume" : "pause", snapshot?.paused ? client.resume : client.pause)}>
              {snapshot?.paused ? t("settings.privacy.resume") : t("settings.privacy.pause")}
            </Button>
          )}
          <Button disabled={busy !== null || !active} onClick={() => void run("revoke", client.revoke)}>
            {t("settings.privacy.revoke")}
          </Button>
          <Button disabled={busy !== null || !snapshot?.consent.acceptedAt} onClick={() => {
            if (window.confirm(t("settings.privacy.deleteConfirm"))) void run("delete_remote", client.deleteRemote);
          }}>
            {t("settings.privacy.deleteRemote")}
          </Button>
        </div>
        <SubtleStatus tone={active ? "ok" : "attn"}>
          {active ? t("settings.privacy.active") : t("settings.privacy.inactive")}
        </SubtleStatus>
        {snapshot && !snapshot.enabled ? <Note>{t("settings.privacy.disabledBuild")}</Note> : null}
        {error ? <SubtleStatus tone="attn">{error}</SubtleStatus> : null}
      </Surface>

      <Surface
        aria-label={t("settings.privacy.queueTitle")}
        fill
        meta={t("settings.privacy.queueMeta").replace("{{pending}}", String(pending)).replace("{{sent}}", String(sent))}
        title={t("settings.privacy.queueTitle")}
      >
        {snapshot?.queue.length ? (
          <ul className="orbit-set-privacy__queue" data-testid="orbit-settings-privacy-queue">
            {snapshot.queue.map((item) => (
              <li data-state={item.state} key={item.id}>
                <span><b>{t(`settings.privacy.state.${item.state}`)}</b> · {item.bundle.payload.combinationId as string}</span>
                <time>{new Date(item.updatedAt).toLocaleString(locale)}</time>
                <details>
                  <summary>{t("settings.privacy.inspect")}</summary>
                  <pre>{JSON.stringify(item.bundle, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        ) : <Note>{t("settings.privacy.queueEmpty")}</Note>}
        <Button disabled={busy !== null || !active || snapshot?.paused || !snapshot?.enabled || pending === 0} onClick={() => void run("dispatch", client.dispatch)}>
          {t("settings.privacy.dispatch")}
        </Button>
      </Surface>

      <Surface aria-label={t("settings.privacy.historyTitle")} fill title={t("settings.privacy.historyTitle")}>
        {snapshot?.deletions.length ? (
          <ul className="orbit-set-privacy__history">
            {snapshot.deletions.map((deletion) => (
              <li key={`${deletion.requestedAt}-${deletion.tombstoneRef ?? deletion.state}`}>
                {t(`settings.privacy.deletion.${deletion.state}`)} · {new Date(deletion.requestedAt).toLocaleString(locale)}
                {deletion.applyWithinDays ? ` · ${t("settings.privacy.deleteSla").replace("{{days}}", String(deletion.applyWithinDays))}` : ""}
              </li>
            ))}
          </ul>
        ) : <Note>{t("settings.privacy.historyEmpty")}</Note>}
        <Note>{t("settings.privacy.aggregateNote")}</Note>
      </Surface>
    </div>
  );
}
