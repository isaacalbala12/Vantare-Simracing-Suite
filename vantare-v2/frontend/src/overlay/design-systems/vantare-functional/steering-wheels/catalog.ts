/** LMU catalogue checked on 2026-09-24. Provenance and scope: docs/analysis/lmu-steering-wheels.md. */
export const LMU_STEERING_WHEELS = [
  { id: "alpine-a424", name: "Alpine A424", category: "Hypercar" },
  { id: "aston-martin-valkyrie", name: "Aston Martin Valkyrie AMR-LMH", category: "Hypercar" },
  { id: "bmw-m-hybrid-v8-pre-le-mans", name: "BMW M Hybrid V8 · pre-Le Mans 2024", category: "Hypercar" },
  { id: "bmw-m-hybrid-v8", name: "BMW M Hybrid V8 · Le Mans 2024+", category: "Hypercar" },
  { id: "cadillac-v-series-r", name: "Cadillac V-Series.R / Evo", category: "Hypercar" },
  { id: "ferrari-499p", name: "Ferrari 499P", category: "Hypercar" },
  { id: "genesis-gmr-001", name: "Genesis GMR-001", category: "Hypercar" },
  { id: "glickenhaus-scg007", name: "Glickenhaus SCG 007", category: "Hypercar" },
  { id: "isotta-fraschini-tipo6", name: "Isotta Fraschini Tipo 6", category: "Hypercar" },
  { id: "lamborghini-sc63", name: "Lamborghini SC63", category: "Hypercar" },
  { id: "peugeot-9x8", name: "Peugeot 9X8 · 2023", category: "Hypercar" },
  { id: "peugeot-9x8-2024", name: "Peugeot 9X8 · 2024+", category: "Hypercar" },
  { id: "porsche-963", name: "Porsche 963", category: "Hypercar" },
  { id: "toyota-gr010", name: "Toyota GR010 Hybrid", category: "Hypercar" },
  { id: "toyota-tr010", name: "Toyota TR010 Hybrid", category: "Hypercar" },
  { id: "vanwall-vandervell-680", name: "Vanwall Vandervell 680", category: "Hypercar" },
  { id: "aston-martin-vantage-gt3", name: "Aston Martin Vantage AMR LMGT3", category: "LMGT3" },
  { id: "bmw-m4-gt3", name: "BMW M4 LMGT3 / Evo", category: "LMGT3" },
  { id: "corvette-z06-gt3", name: "Corvette Z06 LMGT3.R", category: "LMGT3" },
  { id: "ferrari-296-gt3", name: "Ferrari 296 LMGT3 / Evo", category: "LMGT3" },
  { id: "ford-mustang-gt3", name: "Ford Mustang LMGT3", category: "LMGT3" },
  { id: "lamborghini-huracan-gt3", name: "Lamborghini Huracán LMGT3 Evo2", category: "LMGT3" },
  { id: "lexus-rc-f-gt3", name: "Lexus RC F LMGT3", category: "LMGT3" },
  { id: "mclaren-720s-gt3", name: "McLaren 720S LMGT3 Evo", category: "LMGT3" },
  { id: "mercedes-amg-gt3", name: "Mercedes-AMG LMGT3", category: "LMGT3" },
  { id: "porsche-911-gt3-r", name: "Porsche 911 GT3 R", category: "LMGT3" },
  { id: "oreca-07", name: "Oreca 07 Gibson", category: "LMP2" },
  { id: "adess-ad25", name: "ADESS AD25", category: "LMP3" },
  { id: "duqueine-d09", name: "Duqueine D09", category: "LMP3" },
  { id: "ginetta-g61-lt-p3-evo", name: "Ginetta G61-LT-P3 Evo", category: "LMP3" },
  { id: "ligier-js-p325", name: "Ligier JS P325", category: "LMP3" },
] as const;

export type LmuSteeringWheelId = typeof LMU_STEERING_WHEELS[number]["id"];
export type SteeringWheelId = "generic" | LmuSteeringWheelId;
export const STEERING_WHEEL_CATEGORIES = ["Hypercar", "LMGT3", "LMP2", "LMP3"] as const;
export const DEFAULT_STEERING_WHEEL: SteeringWheelId = "generic";
const IDS = new Set<string>([DEFAULT_STEERING_WHEEL, ...LMU_STEERING_WHEELS.map(({ id }) => id)]);

export function isSteeringWheelId(value: unknown): value is SteeringWheelId {
  return typeof value === "string" && IDS.has(value);
}

export function normalizeSteeringWheel(value: unknown): SteeringWheelId {
  return isSteeringWheelId(value) ? value : DEFAULT_STEERING_WHEEL;
}

export function parseSteeringWheelSettings(input: unknown): Record<string, unknown> {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  return { ...value, steeringWheel: normalizeSteeringWheel(value.steeringWheel) };
}

export const STEERING_WHEEL_OPTIONS = [
  { value: DEFAULT_STEERING_WHEEL, labelKey: "overlay.inspector.efficiency.steeringWheel.generic" },
  ...LMU_STEERING_WHEELS.map(({ id }) => ({ value: id, labelKey: `overlay.inspector.efficiency.steeringWheel.${id}` })),
];
