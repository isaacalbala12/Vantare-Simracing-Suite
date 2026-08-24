import type {
  StrategyApplicationClient,
  StrategyApplicationCommandV1,
  StrategyApplicationResultV1,
  StrategyOrbitCalculatedPlanV1,
  StrategyOrbitCalculationComparisonV1,
  StrategyOrbitCalculationInputV1,
  StrategyOrbitCalculationResultV1,
} from "../../strategy/strategy-application-client";

/** Test-only double. Production has no TypeScript calculation path. */
export function createOrbitCalculationTestClient(): StrategyApplicationClient<unknown> {
  return {
    async execute(command: StrategyApplicationCommandV1<unknown>): Promise<StrategyApplicationResultV1<unknown>> {
      if (command.operation === "list") {
        return {
          protocolVersion: "strategy.application.v1",
          commandId: command.commandId,
          repositoryVersion: 0,
          plans: [],
          recoveredFromBackup: false,
          closed: false,
        };
      }
      if (command.operation !== "calculate_orbit") throw new Error(`unsupported test operation ${command.operation}`);
      return {
        protocolVersion: "strategy.application.v1",
        commandId: command.commandId,
        repositoryVersion: command.expectedRepositoryVersion,
        orbitCalculation: calculateForTest(command.input),
        recoveredFromBackup: false,
        closed: false,
      };
    },
    cancel: () => false,
    dispose: () => undefined,
  };
}

function calculateForTest(input: StrategyOrbitCalculationInputV1): StrategyOrbitCalculationResultV1 {
  const drivers = new Map(input.drivers.map((driver) => [driver.id, driver]));
  const plans: Record<string, StrategyOrbitCalculatedPlanV1> = {};
  for (const variant of input.variants) {
    const selected = variant.order.map((id) => {
      const driver = drivers.get(id);
      if (!driver) throw new Error(`dangling driver ${id}`);
      return driver[variant.mode];
    });
    const avgPace = selected.reduce((sum, pace) => sum + pace.paceSeconds, 0) / selected.length;
    const avgFuel = selected.reduce((sum, pace) => sum + pace.fuelLitersPerLap, 0) / selected.length;
    const totalLaps = Math.ceil((input.event.durationMinutes * 60) / avgPace);
    const maxLaps = Math.max(1, Math.floor(input.event.tankLiters / avgFuel));
    const count = Math.max(variant.order.length, Math.ceil(totalLaps / maxLaps));
    const fixed = Object.entries(variant.overrides)
      .filter(([index, override]) => Number(index) < count && (override.laps ?? 0) > 0)
      .map(([index]) => Number(index));
    const fixedLaps = fixed.reduce((sum, index) => sum + (variant.overrides[index]?.laps ?? 0), 0);
    const free = count - fixed.length;
    const base = free ? Math.floor((totalLaps - fixedLaps) / free) : 0;
    let extra = free ? (totalLaps - fixedLaps) % free : 0;
    let clock = 0;
    let lap = 0;
    const distribution = new Map<string, { driverId: string; laps: number; seconds: number }>();
    const stints = Array.from({ length: count }, (_, index) => {
      const driverId = variant.order[index % variant.order.length];
      const pace = drivers.get(driverId)![variant.mode];
      const laps = fixed.includes(index) ? variant.overrides[index]!.laps! : base + (extra-- > 0 ? 1 : 0);
      const wanted = variant.overrides[index]?.fuel ?? laps * pace.fuelLitersPerLap;
      const start = clock;
      clock += laps * pace.paceSeconds;
      const lap0 = lap + 1;
      const lap1 = lap + laps;
      const pitWindowLap = Math.max(lap0, lap1 - 3);
      const slice = distribution.get(driverId) ?? { driverId, laps: 0, seconds: 0 };
      slice.laps += laps;
      slice.seconds += clock - start;
      distribution.set(driverId, slice);
      const stint = {
        i: index,
        d: driverId,
        laps,
        fuel: Math.min(wanted, input.event.tankLiters),
        pace: pace.paceSeconds,
        start,
        end: clock,
        lap0,
        lap1,
        pitWindowLap,
        pitWindowSeconds: start + (pitWindowLap - lap0) * pace.paceSeconds,
        over: wanted > input.event.tankLiters + 0.01,
        manual: variant.overrides[index] !== undefined,
      };
      lap = lap1;
      if (index < count - 1) clock += input.event.pitLossSeconds;
      return stint;
    });
    const drivingSeconds = stints.reduce((sum, stint) => sum + stint.end - stint.start, 0);
    const finish = stints.at(-1);
    const finishFuelLiters = finish
      ? Math.max(0, finish.fuel - finish.laps * drivers.get(finish.d)![variant.mode].fuelLitersPerLap)
      : 0;
    plans[variant.id] = {
      stints,
      totalLaps,
      total: clock,
      stops: count - 1,
      maxLaps,
      avgFuel,
      avgPace,
      distribution: [...distribution.values()],
      drivingSeconds,
      pitSeconds: (count - 1) * input.event.pitLossSeconds,
      startFuelLiters: stints[0]?.fuel ?? 0,
      finishFuelLiters,
      reserveLaps: avgFuel > 0 ? finishFuelLiters / avgFuel : 0,
      stopDetails: stints.slice(0, -1).map((stint, index) => ({
        index,
        lap: stint.lap1,
        fuelInLiters: Math.max(0, stint.fuel - stint.laps * drivers.get(stint.d)![variant.mode].fuelLitersPerLap),
        fuelOutLiters: stints[index + 1].fuel,
        pitLossSeconds: input.event.pitLossSeconds,
      })),
    };
  }
  const active = plans[input.activeVariantId];
  const comparisons: Record<string, StrategyOrbitCalculationComparisonV1> = {};
  for (const variant of input.variants) {
    if (variant.id === input.activeVariantId) continue;
    const other = plans[variant.id];
    const winnerIsActive = active.totalLaps >= other.totalLaps;
    const savedStops = active.stops - other.stops;
    const savedS = savedStops * input.event.pitLossSeconds;
    const costS = (other.avgPace - active.avgPace) * other.totalLaps;
    comparisons[variant.id] = {
      winnerId: winnerIsActive ? input.activeVariantId : variant.id,
      loserId: winnerIsActive ? variant.id : input.activeVariantId,
      winnerLaps: Math.max(active.totalLaps, other.totalLaps),
      loserLaps: Math.min(active.totalLaps, other.totalLaps),
      diff: Math.abs(active.totalLaps - other.totalLaps),
      savedStops,
      savedS,
      costS,
      totalDeltaSeconds: other.total - active.total,
      pays: savedS > costS,
      sameStops: savedStops <= 0,
      stints: active.stints.length,
      driverCount: input.drivers.length,
      doubles: input.drivers
        .filter((driver) => active.stints.filter((stint) => stint.d === driver.id).length > 1)
        .map((driver) => driver.name.split(" ")[0]),
    };
  }
  return { plans, comparisons };
}
