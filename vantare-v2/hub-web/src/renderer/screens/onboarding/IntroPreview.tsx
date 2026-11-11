import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PerformanceLevel } from "../../../contract/generated/settings";
import { useHost } from "../../app/Host";
import { useSettings } from "../../app/SettingsState";
import { WindowControls } from "../../app/WindowControls";
import { accountText } from "../../i18n/account.es";
import { t as translate } from "../../i18n/es";
import { onboardingText as t } from "../../i18n/onboarding";
import { onboardingStepsText as stepsText } from "../../i18n/onboarding-pasos";
import { Button } from "../../ui/Button";
import {
  AccountStep,
  type OnboardingAccountStatus,
  signedOutAccount,
} from "../../ui/onboarding/AccountStep";
import {
  AppearanceArt,
  AppearanceStep,
} from "../../ui/onboarding/AppearanceStep";
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
import {
  PerformanceArt,
  PerformanceStep,
} from "../../ui/onboarding/PerformanceStep";
import { PlansArt } from "../../ui/onboarding/PlansArt";

/** Component-catalog entry only; the complete first-run gate belongs to block 7c. */
export function OnboardingIntroPreview({
  onLeave,
  extended = false,
  account = signedOutAccount,
  accountActions,
  accountPending = false,
  onPro,
  proDescription,
}: {
  extended?: boolean;
  account?: OnboardingAccountStatus;
  accountActions?: ReactNode;
  accountPending?: boolean;
  onPro?: () => void;
  proDescription?: string;
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
  const [step, setStep] = useState<IntroStep | 3 | 4 | 5>(0);
  const [simulators, setSimulators] = useState<Simulators>([true, false]);
  const [styles, setStyles] = useState<Styles>([true, false, false, false]);
  const [touched, setTouched] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [level, setLevel] = useState<PerformanceLevel>("balanced");
  const [pricesPending, setPricesPending] = useState(false);
  const [pricesError, setPricesError] = useState(false);
  const pricesLock = useRef(false);
  const pricesEpoch = useRef(0);
  const active = useRef(true);
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (automatic && query.data) setLevel(query.data.recommendedLevel);
  }, [automatic, query.data]);

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
    !!query.data &&
    !query.error &&
    canAdvance(step, simulators, styles) &&
    !settings.pending &&
    !(step === 5 && (!settings.view || settings.error));
  function move(action: "next" | "back" | "skip") {
    const result = onboardingMotion(action, step, allowed);
    if (result.kind !== "page") return;
    pricesEpoch.current++;
    if ((!extended && result.step === 3) || result.step === 6) {
      onLeave(result.step === 6 ? 6 : 3);
      return;
    }
    if (result.step === 7) return;
    setStep(result.step);
    setPricesError(false);
    say(
      result.step <= 2
        ? t.say[result.step]
        : result.step === 3
          ? account.signedIn
            ? stepsText.signedSay
            : stepsText.accountSay
          : result.step === 4
            ? automatic
              ? stepsText.automaticSay
              : stepsText.fixedSay(translate(`track.${level}`))
            : stepsText.lookSay,
    );
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
  async function prices() {
    if (!client || pricesLock.current) return;
    pricesLock.current = true;
    const epoch = pricesEpoch.current;
    setPricesPending(true);
    setPricesError(false);
    try {
      const reply = await client.request({ method: "onboarding.prices" });
      if (
        active.current &&
        pricesEpoch.current === epoch &&
        stepRef.current === 3 &&
        (reply.method !== "onboarding.prices" || !reply.accepted)
      )
        setPricesError(true);
    } catch {
      if (
        active.current &&
        pricesEpoch.current === epoch &&
        stepRef.current === 3
      )
        setPricesError(true);
    } finally {
      pricesLock.current = false;
      if (active.current) setPricesPending(false);
    }
  }
  const introStep = step === 0 || step === 1 || step === 2 ? step : undefined;
  return (
    <OnboardingViewport>
      <OnboardingFrame
        step={step}
        message={
          step === 3
            ? account.blocked
              ? stepsText.accountBlocked
              : account.failed
                ? accountText.failed
                : account.checking
                  ? stepsText.accountChecking
                  : account.signedIn
                    ? stepsText.signedSay
                    : stepsText.accountSay
            : voice.text
        }
        messageRevision={voice.revision}
        emotion={
          (step === 1 && !simulators.some(Boolean)) ||
          (step === 2 && !styles.some(Boolean))
            ? "surprised"
            : "neutral"
        }
        loading={!query.data && !query.error}
        error={
          query.error
            ? t.unavailable
            : settings.error
              ? translate("settings.failed")
              : step === 3 && pricesError
                ? stepsText.pricesFailed
                : undefined
        }
        signed={account.signedIn}
        pending={settings.pending}
        reducedMotion={reducedMotion}
        canContinue={allowed}
        back={() => move("back")}
        next={() => move("next")}
        skip={() => move("skip")}
        windowControls={<WindowControls />}
        art={
          introStep !== undefined ? (
            <IntroArt
              step={introStep}
              simulators={simulators}
              styles={styles}
              found={found}
              reducedMotion={reducedMotion}
            />
          ) : step === 3 ? (
            <PlansArt
              onPrices={() => void prices()}
              onPro={onPro}
              proDescription={proDescription}
              pending={pricesPending}
              proPending={accountPending}
            />
          ) : step === 4 ? (
            <PerformanceArt automatic={automatic} level={level} />
          ) : settings.view ? (
            <AppearanceArt appearance={settings.view.appearance} />
          ) : null
        }
      >
        {introStep !== undefined ? (
          <IntroBody
            step={introStep}
            simulators={simulators}
            styles={styles}
            found={found}
            toggleSimulator={toggleSimulator}
            toggleStyle={toggleStyle}
          />
        ) : step === 3 ? (
          <AccountStep value={account} actions={accountActions} />
        ) : step === 4 && query.data ? (
          <PerformanceStep
            equipment={query.data.equipment}
            automatic={automatic}
            level={level}
            onAutomatic={() => {
              setAutomatic(true);
              setLevel(query.data.recommendedLevel);
              say(stepsText.automaticSay);
            }}
            onLevel={(value) => {
              setAutomatic(false);
              setLevel(value);
              say(
                value === "maximum"
                  ? stepsText.maximumSay
                  : value === "minimum"
                    ? stepsText.minimumSay
                    : stepsText.fixedSay(translate(`track.${value}`)),
              );
            }}
          />
        ) : settings.view ? (
          <AppearanceStep
            appearance={settings.view.appearance}
            disabled={settings.view.protected || !!settings.error}
            pending={settings.pending}
            update={settings.update}
          />
        ) : null}
        {step === 2 && query.data && !query.data.layoutReady && (
          <IntroLayoutNotice />
        )}
        {query.error && (
          <Button onClick={() => void query.refetch()}>{t.retry}</Button>
        )}
        {step === 5 && !settings.view ? (
          <Button onClick={settings.reload}>{t.retry}</Button>
        ) : settings.error ? (
          <Button onClick={settings.retry}>{t.retry}</Button>
        ) : null}
      </OnboardingFrame>
    </OnboardingViewport>
  );
}
