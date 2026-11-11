import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "../../assets/icons/Icon";
import { onboardingText as t } from "../../i18n/onboarding";
import { Button } from "../Button";
import { Skeleton } from "../Data";
import { Helmet } from "./Helmet";
import "./onboarding.css";
export type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type AssistantEmotion = "neutral" | "happy" | "surprised";
export interface FrameProps {
  step: OnboardingStep;
  message: string;
  messageRevision?: number;
  emotion?: AssistantEmotion;
  children: ReactNode;
  art: ReactNode;
  windowControls?: ReactNode;
  canContinue: boolean;
  pending?: boolean;
  loading?: boolean;
  error?: string;
  signed?: boolean;
  usage?: boolean;
  reducedMotion: boolean;
  back: () => void;
  next: () => void;
  skip: () => void;
  enterPrivate?: () => void;
}
function Assistant({
  message,
  step,
  reducedMotion,
  emotion,
}: {
  message: string;
  step: OnboardingStep;
  reducedMotion: boolean;
  emotion?: AssistantEmotion;
}) {
  const chars = Array.from(message);
  const [length, setLength] = useState(reducedMotion ? chars.length : 0);
  useEffect(() => {
    const total = Array.from(message).length;
    if (reducedMotion) {
      setLength(total);
      return;
    }
    let count = 0;
    setLength(0);
    const timer = window.setInterval(() => {
      count++;
      setLength(Math.min(count, total));
      if (count >= total) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [message, reducedMotion]);
  const writing = !reducedMotion && length < chars.length;
  return (
    <div className={`v-ob-radio ${step === 0 ? "v-ob-radio--welcome" : ""}`}>
      {step > 0 && (
        <Helmet
          width={132}
          happy={emotion === "happy"}
          surprised={emotion === "surprised"}
          reducedMotion={reducedMotion}
          className="v-ob-small-helmet"
        />
      )}
      <div className={`v-ob-bubble ${writing ? "v-ob-bubble--writing" : ""}`}>
        <div className="v-ob-assistant-label">
          <span aria-hidden="true" />
          {t.assistant}
        </div>
        <p aria-live="polite">
          {chars.slice(0, reducedMotion ? chars.length : length).join("")}
          {writing ? t.cursor : ""}
        </p>
      </div>
    </div>
  );
}
export function OnboardingFrame(p: FrameProps) {
  const root = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(() =>
    Math.max(0.5, Math.min(window.innerWidth / 1600, window.innerHeight / 900)),
  );
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setScale(
          Math.max(
            0.5,
            Math.min(
              entry.contentRect.width / 1600,
              entry.contentRect.height / 900,
            ),
          ),
        );
    });
    node.focus({ preventScroll: true });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (
        event.target instanceof Element &&
        !root.current?.contains(event.target)
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (p.step > 0 && !p.pending) p.back();
        return;
      }
      if (event.key !== "Enter" || p.pending || p.loading || !p.canContinue)
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "button,input,textarea,select,[contenteditable=true],[role=checkbox],[role=radio],[role=combobox]",
        )
      )
        return;
      event.preventDefault();
      p.next();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [p]);
  const primary =
    p.step === 0
      ? t.start
      : p.step === 3 && !p.signed
        ? t.later
        : p.step === 6
          ? t.finish
          : t.next;
  return (
    <section
      aria-label={t.setup}
      tabIndex={-1}
      className="v-onboarding"
      ref={root}
      style={{ "--ob-s": scale } as CSSProperties}
      data-motion={p.reducedMotion ? "reduced" : "full"}
    >
      <div className="v-ob-backdrop" aria-hidden="true" />
      <header className="v-ob-header">
        <div className="v-ob-brand">
          <span className="v-ob-mark">
            <Icon name="mark" />
          </span>
          <span className="v-ob-wordmark" role="img" aria-label={t.brand} />
        </div>
        <div className="v-ob-header-space" />
        <div className="v-ob-duration">
          <span>
            <Icon name="clock" />
          </span>
          {t.lessMinute}
        </div>
        <Button
          className={`v-ob-button v-ob-skip ${p.step >= 6 ? "v-ob-hidden" : ""}`}
          tabIndex={p.step >= 6 ? -1 : 0}
          aria-hidden={p.step >= 6}
          disabled={p.pending || p.loading}
          onClick={p.skip}
        >
          {t.skip}
        </Button>
      </header>
      {p.windowControls}
      <div className="v-ob-body">
        <div className="v-ob-column">
          <div className="v-ob-copy">
            {p.loading ? (
              <Skeleton label={t.loading} />
            ) : (
              <>
                <Assistant
                  key={`${p.step}:${p.messageRevision ?? 0}`}
                  emotion={p.emotion}
                  message={p.message}
                  step={p.step}
                  reducedMotion={p.reducedMotion}
                />
                <h1>{t.titles[p.step]}</h1>
                <p className="v-ob-lead">
                  {p.step === 6 && p.usage ? t.usageOn : t.leads[p.step]}
                </p>
                {p.children}
                {p.error && (
                  <div className="v-ob-error" role="alert">
                    <p>{p.error}</p>
                    {p.step === 6 && p.enterPrivate && (
                      <Button
                        className="v-ob-button"
                        disabled={p.pending}
                        onClick={p.enterPrivate}
                      >
                        {t.privateExit}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="v-ob-art">{p.art}</div>
      </div>
      <footer className="v-ob-footer">
        <Button
          className={`v-ob-button v-ob-back ${p.step === 0 ? "v-ob-hidden" : ""}`}
          aria-hidden={p.step === 0}
          tabIndex={p.step === 0 ? -1 : 0}
          disabled={p.pending}
          onClick={p.back}
        >
          {t.back}
        </Button>
        <div className="v-ob-progress">
          <div aria-hidden="true">
            {[1, 2, 3, 4, 5, 6].map((ordinal) => (
              <span key={ordinal} data-done={ordinal <= p.step} />
            ))}
          </div>
          <p>{t.progress(p.step)}</p>
        </div>
        <Button
          className={`v-ob-button v-ob-button--primary v-ob-next ${p.step === 7 ? "v-ob-hidden" : ""}`}
          aria-hidden={p.step === 7}
          tabIndex={p.step === 7 || !p.canContinue ? -1 : 0}
          aria-busy={p.pending}
          aria-keyshortcuts="Enter"
          aria-label={primary}
          disabled={!p.canContinue || p.pending || p.loading}
          onClick={p.next}
        >
          {primary}
          <kbd>{t.enter}</kbd>
        </Button>
      </footer>
    </section>
  );
}
