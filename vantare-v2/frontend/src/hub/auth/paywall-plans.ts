export type Plan = {
  key: string;
  name: string;
  price: string;
  /** Claves i18n del catálogo `hub-shared`, no cadenas literales. */
  featureKeys: string[];
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
    featureKeys: [
      "paywall.feature.basicOverlays",
      "paywall.feature.mockTelemetry",
      "paywall.feature.recommendedProfiles",
    ],
  },
  {
    key: "overlays",
    name: "Overlays",
    price: "5 EUR/mes",
    featureKeys: ["paywall.feature.overlaysStudio", "paywall.feature.premiumPresets"],
  },
  {
    key: "engineer",
    name: "Engineer",
    price: "5 EUR/mes",
    featureKeys: ["paywall.feature.engineer"],
  },
  {
    key: "suite",
    name: "Suite",
    price: "8.99 EUR/mes",
    recommended: true,
    featureKeys: ["paywall.feature.overlaysPlusEngineer", "paywall.feature.betaEarlyAccess"],
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
    featureKeys: ["paywall.feature.suiteBeta", "paywall.feature.acLuaPack"],
  },
  {
    key: "visionary_backer",
    name: "Visionary Backer",
    price: "50 EUR/mes",
    featureKeys: ["paywall.feature.founder", "paywall.feature.appCredit"],
  },
];

export type PlanKey = (typeof PAYWALL_PLANS)[number]["key"];

export const BILLING_PAYWALL_PLANS: Plan[] = [
  {
    key: "launch_lifetime",
    name: "Launch Edition",
    price: "30 EUR · lifetime",
    featureKeys: [
      "paywall.feature.fullBundle",
      "paywall.feature.oneTimeLaunch",
      "paywall.feature.noRenewal",
    ],
  },
  {
    key: "pro_monthly",
    name: "Pro Monthly",
    price: "4.99 EUR/mes",
    recommended: true,
    featureKeys: [
      "paywall.feature.fullBundle",
      "paywall.feature.monthlyBilling",
      "paywall.feature.cancelAnytime",
    ],
  },
];

export type BillingPlanKey = (typeof BILLING_PAYWALL_PLANS)[number]["key"];