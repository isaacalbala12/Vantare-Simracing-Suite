// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { Client } from "../src/renderer/bridge/client";

afterEach(() => vi.restoreAllMocks());
it("owns one real subscription per topic and releases only the last lease", async () => {
  const wire = vi.spyOn(MessagePort.prototype, "postMessage");
  const client = await Client.connect();
  const count = (kind: string) =>
    wire.mock.calls.filter(
      ([message]) => message.kind === kind && message.topic === "launcher",
    ).length;
  try {
    const frame = client.subscribe("launcher"),
      screen = client.subscribe("launcher");
    expect(count("subscribe")).toBe(1);
    screen();
    screen();
    expect(count("unsubscribe")).toBe(0);
    frame();
    frame();
    expect(count("unsubscribe")).toBe(1);
    const next = client.subscribe("launcher");
    expect(count("subscribe")).toBe(2);
    next();
    expect(count("unsubscribe")).toBe(2);
  } finally {
    client.close();
  }
});
it("never sends from a released lease after the connection is closed", async () => {
  const wire = vi.spyOn(MessagePort.prototype, "postMessage"),
    client = await Client.connect();
  const release = client.subscribe("launcher");
  client.close();
  const count = wire.mock.calls.length;
  release();
  release();
  client.close();
  client.subscribe("launcher")();
  expect(wire.mock.calls).toHaveLength(count);
});
