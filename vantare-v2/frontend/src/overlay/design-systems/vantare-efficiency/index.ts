/**
 * Canonical Efficiency exports. The implementation modules under
 * `vantare-functional` remain as compatibility shims for existing imports;
 * they are not a second renderer or a second design system.
 */
export { vantareEfficiencyManifest } from "./manifest";
export { SessionInfoEfficiency } from "./SessionInfo";
export { BroadcastTowerFunctional as BroadcastTowerEfficiency } from "../vantare-functional/BroadcastTowerFunctional";
export { CarDamageNumbersFunctional as CarDamageNumbersEfficiency } from "../vantare-functional/CarDamageNumbersFunctional";
export { CarDamageVisualFunctional as CarDamageVisualEfficiency } from "../vantare-functional/CarDamageVisualFunctional";
export { DeltaFunctional as DeltaEfficiency } from "../vantare-functional/DeltaFunctional";
export { DeltaTraceFunctional as DeltaTraceEfficiency } from "../vantare-functional/DeltaTraceFunctional";
export { EngineerRadioFunctional as EngineerRadioEfficiency } from "../vantare-functional/EngineerRadioFunctional";
export { FuelStrategyFunctional as FuelStrategyEfficiency } from "../vantare-functional/FuelStrategyFunctional";
export { HeadToHeadFunctional as HeadToHeadEfficiency } from "../vantare-functional/HeadToHeadFunctional";
export { InputTelemetryFunctional as InputTelemetryEfficiency } from "../vantare-functional/InputTelemetryFunctional";
export { MulticlassRelativeFunctional as MulticlassRelativeEfficiency } from "../vantare-functional/MulticlassRelativeFunctional";
export { PedalsFunctional as PedalsEfficiency } from "../vantare-functional/PedalsFunctional";
export {
  PedalsAdvancedEfficiency,
  PedalsAdvancedEfficiency as PedalsTelemetryEfficiency,
} from "../vantare-functional/PedalsAdvancedEfficiency";
export { RaceScheduleFunctional as RaceScheduleEfficiency } from "../vantare-functional/RaceScheduleFunctional";
export { RacingFlagsFunctional as RacingFlagsEfficiency } from "../vantare-functional/RacingFlagsFunctional";
export { RelativeFunctional as RelativeEfficiency } from "../vantare-functional/RelativeFunctional";
export { StandingsFunctional as StandingsEfficiency } from "../vantare-functional/StandingsFunctional";
export { TrackMapFunctional as TrackMapEfficiency } from "../vantare-functional/TrackMapFunctional";
export { TrackWeatherFunctional as TrackWeatherEfficiency } from "../vantare-functional/TrackWeatherFunctional";
