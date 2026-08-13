// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  agentVisibleState,
  sanitizeAgentObservation,
} from "./testing-center-agent-observability.ts";

Deno.test("merged is not shown as delivered until a verified release", () => {
  assertEquals(agentVisibleState("merged_nightly"), "verifying_nightly");
  assertEquals(agentVisibleState("smoke_running"), "verifying_nightly");
  assertEquals(agentVisibleState("nightly_tagged"), "verifying_nightly");
  assertEquals(agentVisibleState("completed"), "available_nightly");
  assertEquals(agentVisibleState("red_running"), "processing");
  assertEquals(agentVisibleState("reverted"), "reverted_nightly");
  assertEquals(agentVisibleState("needs_owner"), "needs_owner");
});

Deno.test("observability keeps bounded aggregate facts and redacts raw evidence", () => {
  assertEquals(
    sanitizeAgentObservation({
      jobKey: "a".repeat(64),
      phase: "completed",
      provider: "github",
      model: null,
      durationMs: 1234,
      inputTokens: 0,
      outputTokens: 0,
      result: "success",
      reason: "release_verified",
      prompt: "private prompt",
      token: "secret",
      path: "C:/Users/private/file",
    }),
    {
      jobKey: "a".repeat(64),
      phase: "completed",
      provider: "github",
      model: null,
      durationMs: 1234,
      inputTokens: 0,
      outputTokens: 0,
      result: "success",
      reason: "release_verified",
    },
  );
});
