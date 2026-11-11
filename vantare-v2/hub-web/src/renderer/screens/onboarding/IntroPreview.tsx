import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useHost } from "../../app/Host";
import { useSettings } from "../../app/SettingsState";
import { WindowControls } from "../../app/WindowControls";
import { onboardingText as t } from "../../i18n/onboarding";
import { Button } from "../../ui/Button";
import { OnboardingFrame } from "../../ui/onboarding/Frame";
import {
  IntroArt,
  IntroBody,
  IntroLayoutNotice,
  type IntroStep,
  OnboardingViewport,
  type Simulators,
  type Styles,
} from "../../ui/onboarding/Intro";
import { canAdvance, onboardingMotion } from "../../ui/onboarding/navigation";

/** Component-catalog entry only; the complete first-run gate belongs to block 7c. */
export function OnboardingIntroPreview({
  onLeave,
}: {
  onLeave: (step: 3 | 6) => void;
}) {
  const { client } = useHost();
  const settings = useSettings();
  const cache = useQueryClient();
  useEffect(() => {
    if (!client) return;
    const unlisten = client.listen((message) => {
      if (message.kind === "event" && message.event.topic === "launcher")
        void cache.invalidateQueries({ queryKey: ["onboarding"] });
    });
    const unsubscribe = client.subscribe("launcher");
    return () => {
      unsubscribe();
      unlisten();
    };
  }, [client, cache]);
  const query = useQuery({
    queryKey: ["onboarding"],
    enabled: !!client,
    retry: false,
    queryFn: async () => {
      const reply = await client?.request({ method: "onboarding.get" });
      if (reply?.method !== "onboarding.get")
        throw new Error("onboarding unavailable");
      return reply.value;
    },
  });
  const [step, setStep] = useState<IntroStep>(0);
  const [simulators, setSimulators] = useState<Simulators>([true, false]);
  const [styles, setStyles] = useState<Styles>([true, false, false, false]);
  const [touched, setTouched] = useState(false);
  const [voice, setVoice] = useState({ text: t.say[0], revision: 0 });
  function say(text: string) {
    setVoice((previous) => ({ text, revision: previous.revision + 1 }));
  }
  const found = query.data?.simulators ?? ([false, false] as const);
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!touched && step <= 1)
      setSimulators(found.some(Boolean) ? [found[0], found[1]] : [true, false]);
  }, [found[0], found[1], touched, step]);
  const reducedMotion =
    systemReduced || !!settings.view?.appearance.reducedMotion;
  const allowed =
    !!query.data && !query.error && canAdvance(step, simulators, styles);
  function move(action: "next" | "back" | "skip") {
    const result = onboardingMotion(action, step, allowed);
    if (result.kind !== "page") return;
    if (result.step === 3 || result.step === 6) {
      onLeave(result.step);
      return;
    }
    if (result.step !== 0 && result.step !== 1 && result.step !== 2) return;
    setStep(result.step);
    say(t.say[result.step]);
  }
  function toggleSimulator(id: 0 | 1) {
    const next: Simulators = [...simulators];
    next[id] = !next[id];
    setTouched(true);
    setSimulators(next);
    say(
      !next.some(Boolean)
        ? t.noSimulator
        : !next[id]
          ? t.simulatorRemoved
          : id === 0
            ? t.lmuAdded
            : t.accAdded,
    );
  }
  function toggleStyle(id: 0 | 1 | 2 | 3) {
    const next: Styles = [...styles];
    next[id] = !next[id];
    setStyles(next);
    say(
      !next.some(Boolean)
        ? t.noStyle
        : next[id]
          ? t.styleSay[id]
          : t.styleRemoved,
    );
  }
  return (
    <OnboardingViewport>
      <OnboardingFrame
        step={step}
        message={voice.text}
        messageRevision={voice.revision}
        emotion={
          (step === 1 && !simulators.some(Boolean)) ||
          (step === 2 && !styles.some(Boolean))
            ? "surprised"
            : "neutral"
        }
        loading={!query.data && !query.error}
        error={query.error ? t.unavailable : undefined}
        reducedMotion={reducedMotion}
        canContinue={allowed}
        back={() => move("back")}
        next={() => move("next")}
        skip={() => move("skip")}
        windowControls={<WindowControls />}
        art={
          <IntroArt
            step={step}
            simulators={simulators}
            styles={styles}
            found={found}
            reducedMotion={reducedMotion}
          />
        }
      >
        <IntroBody
          step={step}
          simulators={simulators}
          styles={styles}
          found={found}
          toggleSimulator={toggleSimulator}
          toggleStyle={toggleStyle}
        />
        {step === 2 && query.data && !query.data.layoutReady && (
          <IntroLayoutNotice />
        )}
        {query.error && (
          <Button onClick={() => void query.refetch()}>{t.retry}</Button>
        )}
      </OnboardingFrame>
    </OnboardingViewport>
  );
}
