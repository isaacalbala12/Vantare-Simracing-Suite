import { Events } from "@wailsio/runtime";
import type { AudioTestResult, ChangeResult, EngineerChange, EngineerDiagnostics } from "./engineer-orbit-types";

export interface EngineerBridge {
  subscribe(onSnapshot: (snapshot: EngineerDiagnostics) => void): () => void;
  refresh(): void;
  change(change: EngineerChange): Promise<ChangeResult>;
  testAudio(kind: "tone" | "cached"): Promise<AudioTestResult>;
}
function payload(event: { data?: unknown }): unknown {
  return Array.isArray(event.data) ? event.data[0] : event.data;
}
function request<T>(name: string, data: object): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const off = Events.On(`${name}:result`, (event: { data?: unknown }) => {
      const value = payload(event) as ({ requestId?: string } & T) | undefined;
      if (!value || value.requestId !== requestId) return;
      clearTimeout(timer); off(); resolve(value);
    });
    const timer = setTimeout(() => { off(); reject(new Error("timeout")); }, 12_000);
    try { Events.Emit(name, { ...data, requestId }); }
    catch (error) { clearTimeout(timer); off(); reject(error); }
  });
}
export const wailsEngineerBridge: EngineerBridge = {
  subscribe(onSnapshot) {
    return Events.On("engineer:diagnostics", (event: { data?: unknown }) => {
      const value = payload(event) as EngineerDiagnostics | undefined;
      if (value?.version === 1 && value.status && Array.isArray(value.deliveries)) onSnapshot(value);
    });
  },
  refresh() { Events.Emit("engineer:diagnostics:get"); },
  change(change) { return request<ChangeResult>("engineer:command", change); },
  async testAudio(kind) {
    const reply = await request<{ result: AudioTestResult }>("engineer:audio-test", { kind });
    return reply.result;
  },
};
