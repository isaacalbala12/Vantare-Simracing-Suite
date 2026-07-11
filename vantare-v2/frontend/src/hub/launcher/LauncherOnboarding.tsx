import { useState } from "react";
import type { LauncherApp } from "./launcher-contract";

type Props = {
  apps: LauncherApp[];
  onComplete: () => void;
};

export function LauncherOnboarding({ apps, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const launchable = apps.filter((app) => app.availability.launchable);
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="launcher-onboarding">
      <section className="card-sleek w-[min(520px,calc(100vw-2rem))] rounded-xl p-6" role="dialog" aria-modal="true" aria-labelledby="launcher-onboarding-title">
        <span className="v52-eyebrow">Primeros pasos</span>
        <h2 id="launcher-onboarding-title" className="mt-2 text-xl font-bold text-white">Configura tu Launcher</h2>
        {step === 0 ? (
          <>
            <p className="mt-3 text-sm text-vantare-textMuted">Vantare detectará tus aplicaciones y mostrará qué está listo para lanzar.</p>
            <p className="mt-3 text-xs text-white/70">{launchable.length} aplicaciones listas. Las apps no instaladas no se añadirán a perfiles.</p>
          </>
        ) : (
          <p className="mt-3 text-sm text-vantare-textMuted">Puedes usar los perfiles sugeridos o crear uno propio. Nada se lanza automáticamente durante este asistente.</p>
        )}
        <div className="mt-5 flex justify-between gap-2">
          <button type="button" onClick={onComplete} data-testid="launcher-onboarding-skip" className="px-3 py-2 text-xs text-vantare-textDim">Omitir</button>
          {step === 0 ? (
            <button type="button" onClick={() => setStep(1)} data-testid="launcher-onboarding-next" className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-black">Continuar</button>
          ) : (
            <button type="button" onClick={onComplete} data-testid="launcher-onboarding-finish" className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-black">Empezar</button>
          )}
        </div>
      </section>
    </div>
  );
}
