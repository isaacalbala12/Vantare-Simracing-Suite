import { expect, it } from "vitest";
import corpus from "../src/contract/generated/corpus/triage.json";
import { isTriagePreview } from "../src/contract/triage-validation";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

type Packet = {
  p_title: string;
  p_context: {
    email?: string;
    system: Record<string, unknown>;
    app_version: string;
    consent: { accepted_at: string };
    posthog_session_id: string | null;
  };
  p_attachments: { kind: string; sha256: string; content: string }[];
};

const preview = corpus.host.find(
  (message) =>
    message.kind === "response" && message.result.method === "triage.prepare",
);
if (
  preview?.kind !== "response" ||
  !("value" in preview.result) ||
  !("payload" in preview.result.value)
)
  throw new Error("Missing Rust triage corpus");
const { id, payload } = preview.result.value;
if (typeof id !== "string" || typeof payload !== "string")
  throw new Error("Invalid Rust preview");
const value = { id, payload };
it("accepts both Rust-owned methods and the closed preview serialized by Rust", () => {
  expect(corpus.ui.every(isUiMessage)).toBe(true);
  expect(corpus.host.every(isHostMessage)).toBe(true);
  expect(isTriagePreview(value)).toBe(true);
});
it("rejects private prose, extra context, invalid dates/versions, analytics ids and raw log text", () => {
  for (const mutate of [
    (packet: Packet) => {
      packet.p_title = "PRIVATE_TITLE";
    },
    (packet: Packet) => {
      packet.p_context.email = "private@example.com";
    },
    (packet: Packet) => {
      packet.p_context.system = { hostname: "PRIVATE_PC" };
    },
    (packet: Packet) => {
      packet.p_context.app_version = "arbitrary free text";
    },
    (packet: Packet) => {
      packet.p_context.consent.accepted_at = "2026-02-29T12:00:00Z";
    },
    (packet: Packet) => {
      packet.p_context.posthog_session_id = "PRIVATE_ANALYTICS";
    },
    (packet: Packet) => {
      packet.p_attachments = [
        {
          kind: "app_log",
          sha256: "a".repeat(64),
          content: JSON.stringify([
            {
              level: "ERROR",
              module: "services",
              relative_ms: 0,
              message: "PRIVATE_LOG",
            },
          ]),
        },
      ];
    },
  ]) {
    const packet = JSON.parse(value.payload);
    mutate(packet);
    expect(isTriagePreview({ ...value, payload: JSON.stringify(packet) })).toBe(
      false,
    );
  }
  expect(isTriagePreview({ ...value, payload: "{}" })).toBe(false);
  expect(isTriagePreview({ ...value, id: "a".repeat(63) })).toBe(false);
});
it("rejects unregistered arguments and duplicate or unknown selected items", () => {
  for (const request of [
    {
      method: "triage.prepare",
      selection: { items: [] },
      consent: true,
      title: "PRIVATE",
    },
    {
      method: "triage.prepare",
      selection: { items: ["system", "system"] },
      consent: true,
    },
    { method: "triage.prepare", selection: { items: ["url"] }, consent: true },
    { method: "triage.send", previewId: "A".repeat(64), consent: true },
    {
      method: "triage.send",
      previewId: "a".repeat(64),
      consent: true,
      payload: "PRIVATE",
    },
  ])
    expect(isUiMessage({ kind: "request", id: 1, request })).toBe(false);
});
it("requires tester rights, connection and consent in the mock", () => {
  const request = {
    method: "triage.prepare",
    selection: { items: [] },
    consent: true,
  };
  expect(
    createMockHost("testing-reports")({ kind: "request", id: 1, request }),
  ).toMatchObject({ kind: "failure", error: { kind: "denied" } });
  expect(
    createMockHost("testing-tester-triage-offline")({
      kind: "request",
      id: 1,
      request,
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "coreUnavailable" } });
  expect(
    createMockHost("testing-tester-reports")({
      kind: "request",
      id: 1,
      request: { ...request, consent: false },
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "rejected" } });
});
it("consumes a prepared mock id once and keeps the contribution visible on a later refresh", () => {
  const host = createMockHost("testing-tester-reports");
  const prepared = host({
    kind: "request",
    id: 1,
    request: {
      method: "triage.prepare",
      selection: { items: [] },
      consent: true,
    },
  });
  if (
    prepared?.kind !== "response" ||
    prepared.result.method !== "triage.prepare"
  )
    throw new Error("No preview");
  expect(isHostMessage(prepared)).toBe(true);
  const send = {
    kind: "request",
    id: 2,
    request: {
      method: "triage.send",
      previewId: prepared.result.value.id,
      consent: true,
    },
  };
  const sent = host(send);
  expect(sent).toMatchObject({
    kind: "response",
    result: {
      method: "triage.send",
      value: { reports: [{ title: "[contenido retirado por privacidad]" }] },
    },
  });
  expect(host({ ...send, id: 3 })).toMatchObject({
    kind: "failure",
    error: { kind: "rejected" },
  });
  const refreshed = host({
    kind: "request",
    id: 4,
    request: { method: "testing.refresh" },
  });
  expect(refreshed).toMatchObject({
    kind: "response",
    result: {
      value: { reports: [{ title: "[contenido retirado por privacidad]" }] },
    },
  });
});

it("rejects repeated consent items in a core preview", () => {
  const source = corpus.host[0];
  if (source.kind !== "response" || source.result.method !== "triage.prepare")
    throw new Error("missing preview");
  const message = structuredClone(source);
  const payloadText = message.result.value.payload;
  if (typeof payloadText !== "string") throw new Error("missing payload");
  const payload = JSON.parse(payloadText);
  payload.p_context.consent.items = ["system", "system"];
  message.result.value.payload = JSON.stringify(payload);
  expect(isHostMessage(message)).toBe(false);
});
