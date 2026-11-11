import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { PerformanceLevel } from "../../../contract/generated/settings";
import { useHost } from "../../app/Host";
import { useSettings } from "../../app/SettingsState";
import { WindowControls } from "../../app/WindowControls";
import { accountText } from "../../i18n/account.es";
import { t as translate } from "../../i18n/es";
import { onboardingText as t } from "../../i18n/onboarding";
import { onboardingStepsText as stepsText } from "../../i18n/onboarding-pasos";
import { onboardingSummaryText as summaryText } from "../../i18n/onboarding-summary";
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
  kitForStyles,
  OnboardingViewport,
  type Simulators,
  type Styles,
} from "../../ui/onboarding/Intro";
import { KitArt } from "../../ui/onboarding/KitArt";
import { canAdvance, onboardingMotion } from "../../ui/onboarding/navigation";
import {
  PerformanceArt,
  PerformanceStep,
} from "../../ui/onboarding/PerformanceStep";
import { PlansArt } from "../../ui/onboarding/PlansArt";
import {
  type OnboardingMailStatus,
  PrivacyArt,
  PrivacyStep,
} from "../../ui/onboarding/PrivacyStep";
import { SummaryStep } from "../../ui/onboarding/SummaryStep";
import { useCompletion } from "./useCompletion";

/** Shared controller for the first-run gate and its component-catalog preview. */
export function OnboardingIntroPreview({
  onLeave,
  extended = false,
  account = signedOutAccount,
  full = false,
  mail,
  studioReason,
  onComplete,
}: {
  extended?: boolean;
  full?: boolean;
  mail?: OnboardingMailStatus;
  studioReason?: string;
  onComplete?: (privateSession: boolean, show: boolean) => void;
  account?: OnboardingAccountStatus;
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
  const [step, setStep] = useState<IntroStep | 3 | 4 | 5 | 6 | 7>(0);
  const completion = useCompletion(full && step >= 6, onComplete);
  const [simulators, setSimulators] = useState<Simulators>([true, false]);
  const [styles, setStyles] = useState<Styles>([true, false, false, false]);
  const [touched, setTouched] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [level, setLevel] = useState<PerformanceLevel>("balanced");
  const [pricesPending, setPricesPending] = useState(false);
  const [pricesError, setPricesError] = useState(false);
  const pricesLock = useRef(false);
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
    !(full && step >= 6 && !styles.some(Boolean)) &&
    !settings.pending &&
    !completion.pending &&
    !(
      full &&
      step >= 6 &&
      (completion.privacy.isPending || completion.privacy.error)
    ) &&
    !(step === 5 && settings.error);
  function move(action: "next" | "back" | "skip") {
    const result = onboardingMotion(action, step, allowed);
    if (result.kind === "finish") {
      finish(true);
      return;
    }
    if (result.kind !== "page") return;
    if (full && step === 6 && action === "next") {
      completion.consent(() => {
        setStep(7);
        say(summaryText.complete);
      });
      return;
    }
    if (
      (!extended && !full && result.step === 3) ||
      (!full && result.step === 6)
    ) {
      onLeave(result.step === 6 ? 6 : 3);
      return;
    }

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
            : result.step === 5
              ? stepsText.lookSay
              : stepsText.usageOffSay,
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
    setPricesPending(true);
    setPricesError(false);
    try {
      const reply = await client.request({ method: "onboarding.prices" });
      if (reply.method !== "onboarding.prices" || !reply.accepted)
        setPricesError(true);
    } catch {
      setPricesError(true);
    } finally {
      pricesLock.current = false;
      setPricesPending(false);
    }
  }
  function finish(show: boolean) {
    if (!full || !query.data || !allowed || (show === false && studioReason))
      return;
    completion.finish({
      kit: kitForStyles(styles),
      level,
      show,
      layoutRevision: query.data.layoutRevision,
    });
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
          full && step >= 6 && !styles.some(Boolean)
            ? t.noStyle
            : query.error
              ? t.unavailable
              : full && completion.error
                ? completion.error
                : settings.error
                  ? translate("settings.failed")
                  : step === 3 && pricesError
                    ? stepsText.pricesFailed
                    : undefined
        }
        signed={account.signedIn}
        pending={settings.pending || completion.pending}
        usage={completion.intent.usage}
        lead={
          step === 7 && !query.data?.layoutReady
            ? summaryText.notPrepared
            : undefined
        }
        enterPrivate={
          full && completion.privateAllowed
            ? completion.enterPrivate
            : undefined
        }
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
            <PlansArt onPrices={() => void prices()} pending={pricesPending} />
          ) : step === 4 ? (
            <PerformanceArt automatic={automatic} level={level} />
          ) : step === 6 ? (
            <PrivacyArt
              crashes={completion.intent.crashes}
              usage={completion.intent.usage}
            />
          ) : step === 7 ? (
            <KitArt
              kit={kitForStyles(styles)}
              summary={query.data?.layoutReady}
            />
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
          <AccountStep value={account} />
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
        ) : step === 6 ? (
          <PrivacyStep
            crashes={completion.intent.crashes}
            usage={completion.intent.usage}
            pending={completion.pending}
            configured={completion.privacy.data?.reportingConfigured ?? false}
            mail={mail}
            onCrashes={(value) => completion.choose("crashes", value)}
            onUsage={(value) => completion.choose("usage", value)}
            onPolicy={completion.policy}
          />
        ) : step === 7 ? (
          <SummaryStep
            simulators={simulators}
            styles={styles}
            kit={kitForStyles(styles)}
            automatic={automatic}
            level={level}
            crashes={completion.intent.crashes}
            usage={completion.intent.usage}
            account={account}
            mail={mail}
            layoutReady={query.data?.layoutReady ?? false}
            pending={settings.pending || completion.pending}
            studioReason={studioReason}
            onFinish={finish}
          />
        ) : settings.view ? (
          <AppearanceStep
            appearance={settings.view.appearance}
            disabled={settings.view.protected || !!settings.error}
            pending={settings.pending || completion.pending}
            update={settings.update}
          />
        ) : null}
        {step === 2 && query.data && !query.data.layoutReady && (
          <IntroLayoutNotice />
        )}
        {query.error && (
          <Button onClick={() => void query.refetch()}>{t.retry}</Button>
        )}
        {full && step >= 6 && completion.privacy.error && (
          <Button onClick={() => void completion.privacy.refetch()}>
            {t.retry}
          </Button>
        )}
        {settings.error && <Button onClick={settings.retry}>{t.retry}</Button>}
      </OnboardingFrame>
    </OnboardingViewport>
  );
}
