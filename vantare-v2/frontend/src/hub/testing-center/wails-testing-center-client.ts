import { Events } from "@wailsio/runtime";
import { createTestingCenterClient } from "./testing-center-client";

export const wailsTestingCenterClient = createTestingCenterClient({
  emit(name, payload) { Events.Emit(name, payload); },
  on(name, listener) { return Events.On(name, listener); },
});
