import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { LicenseProvider, useLicense } from "../../lib/license";
import { LoginScreen } from "../auth/LoginScreen";
import { PaywallScreen } from "../auth/PaywallScreen";

export type OnboardingStep =
  | "simulator"
  | "auth"
  | "recommended";

export type SimulatorId = "lmu" | "iracing" | "acc";

const SIMULATORS: { id: SimulatorId; name: string; note: string }[] = [
  { id: "lmu", name: "Le Mans Ultimate", note: "Release 02 sim principal" },
  { id: "iracing", name: "iRacing", note: "Release 06" },
  { id: "acc", name: "Assetto Corsa Competizione", note: "Release 06" },
];

type OnboardingFlowProps = {
  initialStep?: OnboardingStep;
  onComplete?: () => void;
  children?: ReactNode;
};

function SimulatorStep({
  onNext,
}: {
  onNext: (sim: SimulatorId) => void;
}) {
  return (
    <section
      data-testid="onboarding-step-simulator"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0a0a0a] p-4 text-white"
    >
      <h1 className="font-mono text-sm uppercase tracking-widest">
        Bienvenido a Vantare
      </h1>
      <p className="font-mono text-[10px] text-vantare-textDim">
        Elige tu simulador principal para empezar
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {SIMULATORS.map((sim) => (
          <button
            key={sim.id}
            type="button"
            onClick={() => onNext(sim.id)}
            className="w-56 rounded-lg border border-white/10 bg-[#111] p-4 text-left hover:border-vantare-red-500"
          >
            <p className="font-mono text-xs uppercase">{sim.name}</p>
            <p className="font-mono text-[10px] text-vantare-textDim">
              {sim.note}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

function RecommendedStep({
  onComplete,
  children,
}: {
  onComplete: () => void;
  children?: ReactNode;
}) {
  return (
    <section
      data-testid="onboarding-step-recommended"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0a] p-4 text-white"
    >
      <h1 className="font-mono text-sm uppercase tracking-widest">
        Elige tu perfil recomendado
      </h1>
      <p className="font-mono text-[10px] text-vantare-textDim">
        Empezamos con un perfil base. Podrás cambiarlo en cualquier momento.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onComplete}
          className="rounded bg-vantare-red-500 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-black"
        >
          Empezar
        </button>
      </div>
      {children}
    </section>
  );
}

function AuthStage() {
  const { result, loading } = useLicense();
  if (loading) {
    return (
      <div
        data-testid="license-loading"
        className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white"
      >
        <p className="font-mono text-xs uppercase tracking-widest text-vantare-textDim">
          Cargando licencia...
        </p>
      </div>
    );
  }
  if (!result || result.state === "anonymous") {
    return <LoginScreen onLoggedIn={() => window.location.reload()} />;
  }
  if (
    result.state === "expired" ||
    result.state === "device-limit"
  ) {
    return <PaywallScreen email={result.email} result={result} />;
  }
  return null;
}

function OnboardingSteps({
  initialStep,
  onComplete,
  children,
}: Required<Pick<OnboardingFlowProps, "initialStep">> &
  Pick<OnboardingFlowProps, "onComplete" | "children">) {
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const { result } = useLicense();

  const goToAuth = useCallback(() => setStep("auth"), []);

  if (step === "simulator") {
    return <SimulatorStep onNext={goToAuth} />;
  }

  if (step === "auth") {
    // If the user already has an active license, skip auth+paywall and move to
    // recommended step. This makes the flow feel responsive when returning
    // users who are still signed in.
    if (
      result &&
      (result.state === "active" || result.state === "grace" || result.state === "authenticated-no-entitlement")
    ) {
      return (
        <RecommendedStep onComplete={() => onComplete?.()}>
          {children}
        </RecommendedStep>
      );
    }
    return (
      <AuthStage />
    );
  }

  return (
    <RecommendedStep onComplete={() => onComplete?.()}>
      {children}
    </RecommendedStep>
  );
}

export function OnboardingFlow({
  initialStep = "simulator",
  onComplete,
  children,
}: OnboardingFlowProps) {
  return (
    <LicenseProvider>
      <OnboardingSteps
        initialStep={initialStep}
        onComplete={onComplete}
      >
        {children}
      </OnboardingSteps>
    </LicenseProvider>
  );
}