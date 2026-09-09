/** Wire contract for solver.EventRules. Go owns race feasibility validation. */
export type StrategyEventRules = {
  readonly minPitStops?: number;
  readonly maxPitStops?: number;
  readonly requiredWindows?: readonly StrategyLapWindow[];
  readonly mandatoryCompounds?: readonly StrategyRuleCompound[];
  readonly driverLimits?: Readonly<Record<string, {
    readonly minLaps?: number;
    readonly maxLaps?: number;
    readonly maxContinuousTimeSeconds?: number;
    readonly maxTotalTimeSeconds?: number;
    readonly unavailable?: readonly StrategyLapWindow[];
  }>>;
  readonly allowedCompoundsByClimate?: Readonly<Partial<Record<"dry" | "humid" | "wet", readonly StrategyRuleCompound[]>>>;
};

type StrategyLapWindow = { readonly fromLap: number; readonly toLap: number };
type StrategyRuleCompound = "soft" | "medium" | "hard" | "wet";

export function validateStrategyEventRules(value: unknown, field: string): asserts value is StrategyEventRules {
  const invalid = () => { throw new Error(`Invalid Strategy ${field}`); };
  const record = (candidate: unknown): Record<string, unknown> => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return invalid();
    return candidate as Record<string, unknown>;
  };
  const integer = (candidate: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => {
    if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) invalid();
  };
  const range = (candidate: Record<string, unknown>, minimum: string, maximum: string, bound = Number.MAX_SAFE_INTEGER) => {
    if (candidate[minimum] !== undefined) integer(candidate[minimum], 0, bound);
    if (candidate[maximum] !== undefined) integer(candidate[maximum], 0, bound);
    if (typeof candidate[minimum] === "number" && typeof candidate[maximum] === "number" && candidate[minimum] > candidate[maximum]) invalid();
  };
  const windows = (candidate: unknown, maximum: number, count = Number.MAX_SAFE_INTEGER) => {
    if (!Array.isArray(candidate) || candidate.length > count) return invalid();
    for (const item of candidate) {
      const window = record(item);
      integer(window.fromLap, 1, maximum);
      integer(window.toLap, 1, maximum);
      if ((window.fromLap as number) > (window.toLap as number)) invalid();
    }
  };
  const compounds = (candidate: unknown, nonempty = false) => {
    if (!Array.isArray(candidate) || (nonempty && candidate.length === 0)) return invalid();
    if (new Set(candidate).size !== candidate.length || candidate.some(item => !["soft", "medium", "hard", "wet"].includes(item))) invalid();
  };
  const rules = record(value);
  range(rules, "minPitStops", "maxPitStops");
  if (rules.requiredWindows !== undefined) windows(rules.requiredWindows, 99999, 64);
  if (rules.mandatoryCompounds !== undefined) compounds(rules.mandatoryCompounds);
  if (rules.driverLimits !== undefined) {
    for (const [id, candidate] of Object.entries(record(rules.driverLimits))) {
      if (!id.trim()) invalid();
      const limit = record(candidate);
      range(limit, "minLaps", "maxLaps", 100000);
      for (const key of ["maxContinuousTimeSeconds", "maxTotalTimeSeconds"]) {
        const seconds = limit[key];
        if (seconds !== undefined && (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0)) invalid();
      }
      if (limit.unavailable !== undefined) windows(limit.unavailable, 100000);
    }
  }
  if (rules.allowedCompoundsByClimate !== undefined) {
    for (const [bucket, allowed] of Object.entries(record(rules.allowedCompoundsByClimate))) {
      if (!["dry", "humid", "wet"].includes(bucket)) invalid();
      compounds(allowed, true);
    }
  }
}
