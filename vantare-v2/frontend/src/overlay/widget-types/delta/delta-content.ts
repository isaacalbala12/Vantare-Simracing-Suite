export const DELTA_REFERENCES = ["personal-best", "session-best", "previous-lap"] as const;
export type DeltaReference = (typeof DELTA_REFERENCES)[number];
export type DeltaContent = { reference?: DeltaReference };
