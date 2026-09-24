import { useCallback, useEffect, useRef, useState } from "react";
import { Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";
import { useAccess } from "../../lib/access";
import { Button, Surface } from "../../ui/orbit";
import {
  emptyDocument, newItem, parsePublication, ROADMAP_LOCALES, ROADMAP_SECTIONS,
  validateDocument, type RoadmapDocument, type RoadmapItem, type RoadmapLocale,
  type RoadmapPublication, type RoadmapSection,
} from "./roadmap-contract";
import "../../styles/orbit-roadmap.css";

type Response = { requestId?: string; publication?: unknown; draftId?: string; message?: string };
function responseOf(event: unknown): Response {
  const data = event && typeof event === "object" ? (event as { data?: unknown }).data : null;
  return data && typeof data === "object" ? data as Response : {};
}

export function RoadmapOrbitPage() {
  const { t, locale } = useI18n();
  const access = useAccess();
  const owner = access.roles.includes("owner") && !access.isBlocked;
  const language: RoadmapLocale = ROADMAP_LOCALES.includes(locale as RoadmapLocale) ? locale as RoadmapLocale : "es";
  const [published, setPublished] = useState<RoadmapPublication | null>(null);
  const [draft, setDraft] = useState<RoadmapDocument>(emptyDocument);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requests = useRef({ current: "", draft: "", mutation: "" });
  const translate = useRef(t);
  useEffect(() => { translate.current = t; }, [t]);

  const send = useCallback((name: string, payload: object) => {
    const failed = () => {
      if (name === "roadmap:current:get") setLoaded(true);
      if (name === "roadmap:draft:get") setDraftLoaded(true);
      setError(translate.current("roadmap.editor.connectionError")); setBusy(null);
    };
    try {
      Promise.resolve(Events.Emit(name, payload)).catch(failed);
    } catch {
      failed();
    }
  }, []);

  useEffect(() => {
    const currentID = crypto.randomUUID();
    const draftRequestID = crypto.randomUUID();
    requests.current.current = currentID;
    requests.current.draft = draftRequestID;
    const off = [
      Events.On("roadmap:current", (event: unknown) => {
        const value = responseOf(event);
        if (value.requestId !== currentID) return;
        const result = parsePublication(value.publication);
        if (value.publication && !result) { setError(translate.current("roadmap.editor.invalidRemote")); setLoaded(true); return; }
        setPublished(result);
        setLoaded(true);
      }),
      Events.On("roadmap:draft", (event: unknown) => {
        const value = responseOf(event);
        if (value.requestId !== draftRequestID) return;
        const result = parsePublication(value.publication);
        if (value.publication && !result) { setError(translate.current("roadmap.editor.invalidRemote")); setDraftLoaded(true); return; }
        if (result) { setDraft(result.document); setDraftId(result.id); }
        setDraftLoaded(true);
      }),
      Events.On("roadmap:saved", (event: unknown) => {
        const value = responseOf(event);
        if (value.requestId !== requests.current.mutation || !value.draftId) return;
        setDraftId(value.draftId); setDirty(false); setBusy(null); setMessage(translate.current("roadmap.editor.saved"));
      }),
      Events.On("roadmap:published", (event: unknown) => {
        const value = responseOf(event);
        if (value.requestId !== requests.current.mutation) return;
        const result = parsePublication(value.publication);
        if (!result) setError(translate.current("roadmap.editor.invalidRemote"));
        else { setPublished(result); setDraftId(null); setEditing(false); setMessage(translate.current("roadmap.editor.published")); }
        setBusy(null);
      }),
      Events.On("roadmap:error", (event: unknown) => {
        const value = responseOf(event);
        if (![currentID, draftRequestID, requests.current.mutation].includes(value.requestId ?? "")) return;
        if (value.requestId === currentID) setLoaded(true);
        if (value.requestId === draftRequestID) setDraftLoaded(true);
        setError(value.message ?? translate.current("roadmap.editor.connectionError")); setBusy(null);
      }),
    ];
    send("roadmap:current:get", { requestId: currentID });
    if (owner) send("roadmap:draft:get", { requestId: draftRequestID });
    return () => off.forEach((unsubscribe) => unsubscribe());
  }, [owner, send]);

  const updateItem = (id: string, change: (item: RoadmapItem) => RoadmapItem) => {
    setDraft((current) => ({ ...current, items: current.items.map((item) => item.id === id ? change(item) : item) }));
    setDirty(true); setMessage(null);
  };
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= draft.items.length) return;
    setDraft((current) => {
      const items = [...current.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, items };
    });
    setDirty(true);
  };
  const save = () => {
    const invalid = validateDocument(draft);
    if (invalid) { setError(t(`roadmap.editor.invalid.${invalid}`)); return; }
    const requestId = crypto.randomUUID();
    requests.current.mutation = requestId;
    setBusy("save"); setError(null);
    send("roadmap:draft:save", { requestId, document: draft });
  };
  const publish = () => {
    if (!draftId || dirty) return;
    const requestId = crypto.randomUUID();
    requests.current.mutation = requestId;
    setBusy("publish"); setError(null);
    send("roadmap:publish", { requestId, draftId });
  };
  const beginEditing = () => {
    if (!dirty && !draftId) setDraft(structuredClone(published?.document ?? emptyDocument()));
    setError(null); setMessage(null); setEditing(true);
  };

  return (
    <div className="orbit-rm" data-testid="orbit-roadmap">
      <header className="orbit-rm__head">
        <div className="orbit-rm__head-copy">
          <span className="orbit-eyebrow">{t("roadmap.eyebrow")}</span>
          <h2>{t("roadmap.title")}</h2>
          <p>{t("roadmap.lead")}</p>
        </div>
        {owner && loaded && draftLoaded ? (
          <Button size="sm" onClick={() => editing ? setEditing(false) : beginEditing()}>
            {editing ? t("roadmap.editor.close") : t("roadmap.editor.open")}
          </Button>
        ) : null}
      </header>
      <Surface aria-label={t("roadmap.title")} className="orbit-rm__reader" fill>
        <div className="orbit-rm__column">
          {!loaded ? <p className="orbit-rm__empty">{t("roadmap.source.loading")}</p> : null}
          {loaded && !editing && !published ? <p className="orbit-rm__empty">{t("roadmap.editor.unpublished")}</p> : null}
          {editing ? (
            <div className="orbit-rm__editor" data-testid="roadmap-editor">
              <p>{t("roadmap.editor.help")}</p>
              <div className="orbit-rm__editor-actions">
                <Button size="sm" disabled={busy !== null || draft.items.length >= 40} onClick={() => { setDraft((current) => ({ ...current, items: [...current.items, newItem()] })); setDirty(true); }}>{t("roadmap.editor.add")}</Button>
                <Button size="sm" disabled={busy !== null || (!dirty && Boolean(draftId))} onClick={save}>{busy === "save" ? t("roadmap.editor.saving") : t("roadmap.editor.save")}</Button>
                <Button size="sm" disabled={busy !== null || !draftId || dirty} onClick={publish}>{busy === "publish" ? t("roadmap.editor.publishing") : t("roadmap.editor.publish")}</Button>
              </div>
              {draft.items.map((item, index) => (
                <fieldset className="orbit-rm__edit-card" disabled={busy !== null} key={item.id}>
                  <legend>{t("roadmap.editor.item")} {index + 1}</legend>
                  <label>{t("roadmap.editor.section")}
                    <select value={item.section} onChange={(event) => updateItem(item.id, (current) => ({ ...current, section: event.target.value as RoadmapSection }))}>
                      {ROADMAP_SECTIONS.map((section) => <option key={section} value={section}>{t(`roadmap.${section}.title`)}</option>)}
                    </select>
                  </label>
                  <div className="orbit-rm__edit-language">
                    <b>ES</b>
                    <label>{t("roadmap.editor.itemTitle")}<input maxLength={120} value={item.title.es} onChange={(event) => updateItem(item.id, (current) => ({ ...current, title: { ...current.title, es: event.target.value } }))} /></label>
                    <label>{t("roadmap.editor.itemBody")}<textarea maxLength={600} value={item.body.es} onChange={(event) => updateItem(item.id, (current) => ({ ...current, body: { ...current.body, es: event.target.value } }))} /></label>
                  </div>
                  <details>
                    <summary>{t("roadmap.editor.translations")}</summary>
                    {ROADMAP_LOCALES.filter((lang) => lang !== "es").map((lang) => (
                      <div className="orbit-rm__edit-language" key={lang}>
                        <b>{lang.toUpperCase()}</b>
                        <label>{t("roadmap.editor.itemTitle")}<input maxLength={120} value={item.title[lang]} onChange={(event) => updateItem(item.id, (current) => ({ ...current, title: { ...current.title, [lang]: event.target.value } }))} /></label>
                        <label>{t("roadmap.editor.itemBody")}<textarea maxLength={600} value={item.body[lang]} onChange={(event) => updateItem(item.id, (current) => ({ ...current, body: { ...current.body, [lang]: event.target.value } }))} /></label>
                      </div>
                    ))}
                  </details>
                  <div className="orbit-rm__edit-controls">
                    <Button size="sm" disabled={index === 0} onClick={() => move(index, -1)}>{t("roadmap.editor.up")}</Button>
                    <Button size="sm" disabled={index === draft.items.length - 1} onClick={() => move(index, 1)}>{t("roadmap.editor.down")}</Button>
                    <Button size="sm" onClick={() => { setDraft((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id) })); setDirty(true); }}>{t("roadmap.editor.delete")}</Button>
                  </div>
                </fieldset>
              ))}
            </div>
          ) : loaded && published ? ROADMAP_SECTIONS.map((section) => {
            const items = published.document.items.filter((item) => item.section === section);
            if (items.length === 0) return null;
            return (
              <section className="orbit-rm__section" data-testid={`orbit-roadmap-${section}`} key={section}>
                <h3 className="orbit-rm__rule"><span>{t(`roadmap.${section}.title`)}</span></h3>
                <ul className="orbit-rm__simple-list">
                  {items.map((item) => <li key={item.id}><strong>{item.title[language]?.trim() || item.title.es}</strong>{(item.body[language]?.trim() || item.body.es) ? <p>{item.body[language]?.trim() || item.body.es}</p> : null}</li>)}
                </ul>
              </section>
            );
          }) : null}
          {message ? <p role="status">{message}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
        </div>
      </Surface>
    </div>
  );
}
