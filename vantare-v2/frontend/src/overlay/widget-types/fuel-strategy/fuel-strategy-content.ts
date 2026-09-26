export type FuelStrategySource = "fuel" | "virtual-energy";
export type FuelStrategyContent = { historyRows: number; units: "liters"; showProjection: boolean; source: FuelStrategySource };
