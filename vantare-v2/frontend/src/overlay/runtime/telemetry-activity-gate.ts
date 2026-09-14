export type TelemetryActivityGate = Readonly<{
  getActive(): boolean;
  subscribe(listener: (active: boolean) => void): () => void;
}>;
