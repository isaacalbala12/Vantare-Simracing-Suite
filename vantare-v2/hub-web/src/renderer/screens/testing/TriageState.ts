import { useCallback, useEffect, useRef, useState } from "react";
import {
  type TriageItem,
  type TriagePreview,
  type TriageSelection,
  triageItems,
  triageLocalBodyMaxChars,
  triageLocalTitleMaxChars,
} from "../../../contract/generated/triage";

export function useTriageState({
  session,
  allowed,
  available,
  prepare,
  send,
}: {
  session?: object;
  allowed: boolean;
  available: boolean;
  prepare: (selection: TriageSelection) => Promise<TriagePreview>;
  send: (previewId: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [items, setItems] = useState<TriageItem[]>([...triageItems]);
  const [consent, setConsent] = useState(false);
  const [preview, setPreview] = useState<TriagePreview>();
  const [pending, setPending] = useState(false);
  const revision = useRef(0);
  const generation = useRef(0);
  const running = useRef(false);
  const identity = useRef(session);
  const previousAllowed = useRef(allowed);
  const current = useRef({ allowed, available });
  current.current = { allowed, available };
  const invalidate = useCallback(() => {
    revision.current++;
    setPreview(undefined);
    setConsent(false);
  }, []);
  useEffect(() => {
    if (identity.current === session && previousAllowed.current === allowed)
      return;
    identity.current = session;
    previousAllowed.current = allowed;
    generation.current++;
    running.current = false;
    setPending(false);
    setTitle("");
    setBody("");
    setItems([...triageItems]);
    invalidate();
  }, [session, allowed, invalidate]);
  useEffect(() => {
    if (!available) invalidate();
  }, [available, invalidate]);
  function editTitle(value: string) {
    const next = Array.from(value).slice(0, triageLocalTitleMaxChars).join("");
    if (next !== title) {
      invalidate();
      setTitle(next);
    }
  }
  function editBody(value: string) {
    const next = Array.from(value).slice(0, triageLocalBodyMaxChars).join("");
    if (next !== body) {
      invalidate();
      setBody(next);
    }
  }
  function choose(item: TriageItem, checked: boolean) {
    invalidate();
    setItems((current) =>
      checked
        ? [...current.filter((value) => value !== item), item]
        : current.filter((value) => value !== item),
    );
  }
  function accept(value: boolean) {
    if (!value) invalidate();
    else setConsent(true);
  }
  async function prepareReport() {
    if (
      running.current ||
      !consent ||
      !current.current.allowed ||
      !current.current.available
    )
      return;
    running.current = true;
    setPending(true);
    setPreview(undefined);
    const epoch = generation.current,
      expected = revision.current;
    try {
      const value = await prepare({ items: [...items] });
      if (
        epoch === generation.current &&
        expected === revision.current &&
        current.current.allowed &&
        current.current.available
      ) {
        setPreview(value);
        setConsent(false);
      }
    } finally {
      if (epoch === generation.current) {
        running.current = false;
        setPending(false);
      }
    }
  }
  async function sendReport() {
    if (
      running.current ||
      !preview ||
      !consent ||
      !current.current.allowed ||
      !current.current.available
    )
      return;
    running.current = true;
    setPending(true);
    setConsent(false);
    const epoch = generation.current,
      expected = revision.current;
    try {
      await send(preview.id);
      if (epoch === generation.current && expected === revision.current)
        setPreview(undefined);
    } finally {
      if (epoch === generation.current) {
        running.current = false;
        setPending(false);
      }
    }
  }
  return {
    title,
    body,
    items,
    consent,
    preview,
    pending,
    editTitle,
    editBody,
    choose,
    accept,
    prepareReport,
    sendReport,
  };
}
