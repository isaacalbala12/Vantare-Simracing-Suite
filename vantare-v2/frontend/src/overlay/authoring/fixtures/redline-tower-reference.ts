import type { StandingsViewModel } from "../../widget-types/standings/standings-view-model";

/** Approved HTML comparison data, NOT a simulator frame. Imported only by Workshop. */
export const REDLINE_TOWER_REFERENCE: StandingsViewModel = {
  type: "standings", status: "ready", activeClass: "HYPERCAR",
  sessionLabel: "RACE", remainingText: "02:17:32", trackName: "SPA-FRANCORCHAMPS", totalRows: 24,
  columns: [],
  rows: [
    ["porsche", "6", "ESTRE", "LEAD"],
    ["ferrari", "50", "FUOCO", "+0.8"],
    ["toyota", "8", "HARTLEY", "+1.3"],
    ["cadillac", "38", "BOURDAIS", "+2.4"],
    ["alpine", "35", "MILESI", "+3.7"],
    ["ferrari", "51", "PIER GUIDI", "+5.1"],
    ["toyota", "7", "KOBAYASHI", "+6.8"],
    ["bmw", "15", "MARCIELLO", "+8.2"],
    ["aston", "007", "TINCKNELL", "+9.4"],
    ["peugeot", "94", "VANDOORNE", "+10.6"],
    ["porsche", "5", "CHRISTENSEN", "+12.1"],
    ["alpine", "36", "GOUNON", "+13.8"],
  ].map(([manufacturer, driverNumber, driverName, gapText], index) => ({
    id: `reference-${index + 1}`, position: index + 1,
    manufacturer: manufacturer!, driverNumber: driverNumber!, driverName: driverName!, gapText: gapText!,
    vehicleClass: "HYPERCAR", teamCode: "", teamBrandColor: "", intervalText: "",
    currentLapText: "", lastLapText: "", bestLapText: "", pitText: "", tireCompound: "",
    isPlayer: index === 6, isLeader: index === 0,
  })),
};
