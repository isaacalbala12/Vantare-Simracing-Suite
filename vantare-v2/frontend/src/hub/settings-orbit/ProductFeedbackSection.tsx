import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { Button, Note, SubtleStatus, Surface } from "../../ui/orbit";
import {
  deleteProductFeedback,
  listProductFeedback,
  prepareProductFeedback,
  submitProductFeedback,
  ProductFeedbackError,
  type ProductFeedbackCategory,
  type ProductFeedbackChannel,
  type ProductFeedbackEntry,
  type ProductFeedbackInput,
} from "./product-feedback-client";

type Props = {
  appVersion: string | null;
  channel: ProductFeedbackChannel;
};

export function ProductFeedbackSection({ appVersion, channel }: Props) {
  const { t, locale } = useI18n();
  const [category, setCategory] = useState<ProductFeedbackCategory>("experience");
  const [message, setMessage] = useState("");
  const [replyOptIn, setReplyOptIn] = useState(false);
  const [preview, setPreview] = useState<ProductFeedbackInput | null>(null);
  const [entries, setEntries] = useState<ProductFeedbackEntry[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [notice, setNotice] = useState<"sent" | "deleted" | "invalid_message" | "sign_in_required" | "unavailable" | null>(null);

  const refresh = useCallback(async (nextPage = 0) => {
    try {
      const result = await listProductFeedback(nextPage);
      setEntries(result.entries);
      setHasMore(result.hasMore);
      setPage(nextPage);
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof ProductFeedbackError ? error.code : "unavailable");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const showPreview = () => {
    try {
      setPreview(prepareProductFeedback({ category, message, appVersion, channel, replyOptIn }));
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof ProductFeedbackError ? error.code : "unavailable");
    }
  };

  const send = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await submitProductFeedback(preview);
      setPreview(null);
      setMessage("");
      await refresh();
      setNotice("sent");
    } catch (error) {
      setNotice(error instanceof ProductFeedbackError ? error.code : "unavailable");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await deleteProductFeedback(id);
      setDeleteCandidate(null);
      await refresh(page);
      setNotice("deleted");
    } catch (error) {
      setNotice(error instanceof ProductFeedbackError ? error.code : "unavailable");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface aria-label={t("settings.feedback.title")} fill title={t("settings.feedback.title")}>
      <div className="orbit-set-feedback" data-testid="orbit-settings-feedback">
        <Note>{t("settings.feedback.explanation")}</Note>
        {preview ? (
          <div className="orbit-set-feedback__preview" data-testid="orbit-settings-feedback-preview">
            <b>{t("settings.feedback.preview")}</b>
            <dl className="orbit-set-kv">
              <div><dt>{t("settings.feedback.category")}</dt><dd>{t(`settings.feedback.category.${preview.category}`)}</dd></div>
              <div><dt>{t("settings.feedback.message")}</dt><dd className="orbit-set-feedback__message">{preview.message}</dd></div>
              <div><dt>{t("settings.feedback.version")}</dt><dd>{preview.appVersion ?? t("settings.feedback.unknown")}</dd></div>
              <div><dt>{t("settings.feedback.channel")}</dt><dd>{preview.channel}</dd></div>
              <div><dt>{t("settings.feedback.reply")}</dt><dd>{t(preview.replyOptIn ? "settings.feedback.yes" : "settings.feedback.no")}</dd></div>
            </dl>
            <div className="orbit-set-feedback__actions">
              <Button disabled={busy} onClick={() => setPreview(null)} size="sm">{t("settings.feedback.edit")}</Button>
              <Button data-testid="orbit-settings-feedback-send" disabled={busy} onClick={() => { void send(); }} size="sm">{t("settings.feedback.send")}</Button>
            </div>
          </div>
        ) : (
          <div className="orbit-set-feedback__form">
            <label htmlFor="product-feedback-category">{t("settings.feedback.category")}</label>
            <select
              id="product-feedback-category"
              onChange={(event) => setCategory(event.target.value as ProductFeedbackCategory)}
              value={category}
            >
              {(["problem", "idea", "experience"] as const).map((value) => (
                <option key={value} value={value}>{t(`settings.feedback.category.${value}`)}</option>
              ))}
            </select>
            <label htmlFor="product-feedback-message">{t("settings.feedback.message")}</label>
            <textarea
              id="product-feedback-message"
              maxLength={2000}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              value={message}
            />
            <span>{message.trim().length}/2000</span>
            <label className="orbit-set-feedback__check" htmlFor="product-feedback-reply">
              <input
                checked={replyOptIn}
                id="product-feedback-reply"
                onChange={(event) => setReplyOptIn(event.target.checked)}
                type="checkbox"
              />
              {t("settings.feedback.replyOptIn")}
            </label>
            <Button data-testid="orbit-settings-feedback-review" onClick={showPreview} size="sm">
              {t("settings.feedback.review")}
            </Button>
          </div>
        )}
        {notice ? (
          <SubtleStatus tone={notice === "sent" || notice === "deleted" ? "ok" : "attn"}>
            {t(`settings.feedback.notice.${notice}`)}
          </SubtleStatus>
        ) : null}
        <div className="orbit-set-feedback__history">
          <div className="orbit-set-feedback__history-head">
            <b>{t("settings.feedback.history")}</b>
            <Button disabled={busy} onClick={() => { void refresh(); }} size="sm">{t("settings.feedback.refresh")}</Button>
          </div>
          {entries.length === 0 ? <p>{t("settings.feedback.empty")}</p> : (
            <ul>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <b>{t(`settings.feedback.category.${entry.category}`)}</b>
                    <span>{new Date(entry.createdAt).toLocaleDateString(locale)}</span>
                  </div>
                  <p>{entry.message}</p>
                  {deleteCandidate === entry.id ? (
                    <div className="orbit-set-feedback__actions">
                      <Button disabled={busy} onClick={() => setDeleteCandidate(null)} size="sm">{t("settings.feedback.cancel")}</Button>
                      <Button disabled={busy} onClick={() => { void remove(entry.id); }} size="sm">{t("settings.feedback.confirmDelete")}</Button>
                    </div>
                  ) : (
                    <Button disabled={busy} onClick={() => setDeleteCandidate(entry.id)} size="sm">
                      {t("settings.feedback.delete")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="orbit-set-feedback__actions">
            {page > 0 ? <Button disabled={busy} onClick={() => { void refresh(page - 1); }} size="sm">{t("settings.feedback.previous")}</Button> : null}
            {hasMore ? <Button disabled={busy} onClick={() => { void refresh(page + 1); }} size="sm">{t("settings.feedback.next")}</Button> : null}
          </div>
        </div>
      </div>
    </Surface>
  );
}
