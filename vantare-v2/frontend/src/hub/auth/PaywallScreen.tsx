import { useCallback, useState } from "react";
import { PAYWALL_PLANS } from "./paywall-plans";

type PaywallScreenProps = {
  email: string;
};

export function PaywallScreen({ email }: PaywallScreenProps) {
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  const handleSubscribe = useCallback(
    (planKey: string) => {
      // Mini-Plan C v1 does not yet open Stripe Checkout. We surface a clear
      // "coming soon" message instead of silently logging PII to the console.
      setPendingPlan(planKey);
    },
    [],
  );

  return (
    <div
      data-testid="paywall-screen"
      className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] p-4 text-white"
    >
      <h1 className="mb-2 font-mono text-sm uppercase tracking-widest">
        Elige tu plan
      </h1>
      <p className="mb-6 font-mono text-[10px] text-vantare-textDim">
        Sesión iniciada como <span className="text-white">{email}</span>
      </p>
      {pendingPlan ? (
        <p
          data-testid="paywall-coming-soon"
          className="mb-6 rounded border border-white/10 bg-[#111] px-4 py-2 font-mono text-[10px] text-vantare-textDim"
        >
          Pago en línea próximamente para el plan{" "}
          <span className="text-white">{pendingPlan}</span>.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {PAYWALL_PLANS.map((plan) => (
          <div
            key={plan.key}
            className="w-64 rounded-lg border border-white/10 bg-[#111] p-4"
          >
            <h2 className="font-mono text-xs uppercase">{plan.name}</h2>
            <p className="font-mono text-[10px] text-vantare-textDim">
              {plan.price}
            </p>
            <ul className="my-3 space-y-1">
              {plan.features.map((f) => (
                <li
                  key={f}
                  className="font-mono text-[10px] text-vantare-textMuted"
                >
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => handleSubscribe(plan.key)}
              className="w-full rounded border border-white/20 py-1.5 font-mono text-[10px] uppercase hover:bg-white/5"
            >
              Suscribirse
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
