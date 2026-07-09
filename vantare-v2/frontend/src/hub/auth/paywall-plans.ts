export type Plan = {
  key: string;
  name: string;
  price: string;
  features: string[];
  recommended?: boolean;
};

// The plan matrix mirrors docs/stripe-integration-plan.md. Free is shown so
// the tester can compare what is included vs the paid tiers. The "Suite" row
// stays as the recommended option because it unlocks both Overlays and
// Engineer.
export const PAYWALL_PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    price: "0 EUR",
    features: [
      "Overlays básicos",
      "Telemetría mock/demo",
      "Perfiles recomendados incluidos",
    ],
  },
  {
    key: "overlays",
    name: "Overlays",
    price: "5 EUR/mes",
    features: ["Overlays Studio", "Presets premium de overlays"],
  },
  {
    key: "engineer",
    name: "Engineer",
    price: "5 EUR/mes",
    features: ["Ingeniero (spotter y notificaciones)"],
  },
  {
    key: "suite",
    name: "Suite",
    price: "8.99 EUR/mes",
    recommended: true,
    features: ["Overlays + Engineer", "Acceso anticipado a betas"],
  },
];

// Beta founder tiers remain historical/Patreon/early-backer communication; not
// exposed as a primary paywall row but kept here so future UI work has a single
// place to read the matrix from.
export const FOUNDER_PLANS: Plan[] = [
  {
    key: "founder",
    name: "Founder",
    price: "20 EUR/mes",
    features: ["Suite Beta", "AC Lua Pack mientras esté activa"],
  },
  {
    key: "visionary_backer",
    name: "Visionary Backer",
    price: "50 EUR/mes",
    features: ["Founder", "Reconocimiento en app"],
  },
];

export type PlanKey = (typeof PAYWALL_PLANS)[number]["key"];

export const BILLING_PAYWALL_PLANS: Plan[] = [
  {
    key: "launch_lifetime",
    name: "Launch Edition",
    price: "30 EUR · lifetime",
    features: [
      "Bundle completo (Overlays + Engineer)",
      "Pago único de lanzamiento",
      "Sin renovación",
    ],
  },
  {
    key: "pro_monthly",
    name: "Pro Monthly",
    price: "4.99 EUR/mes",
    recommended: true,
    features: [
      "Bundle completo (Overlays + Engineer)",
      "Facturación mensual",
      "Cancela cuando quieras",
    ],
  },
];

export type BillingPlanKey = (typeof BILLING_PAYWALL_PLANS)[number]["key"];