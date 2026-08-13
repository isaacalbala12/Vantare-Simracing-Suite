// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleTestingCenterAgentDispatchRequest,
  type TestingCenterAgentDispatchEndpointDeps,
} from "./index.ts";

const secret = "s".repeat(48);

function request(
  authorization = `Bearer ${secret}`,
  body: unknown = { contractVersion: "testing-center.agent-dispatch.v2" },
) {
  return new Request("https://example.test/agent-dispatch", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deps(
  result: Awaited<
    ReturnType<TestingCenterAgentDispatchEndpointDeps["dispatch"]>
  > = {
    status: "idle",
  },
) {
  let calls = 0;
  return {
    value: {
      serviceRoleSecret: secret,
      dispatch() {
        calls++;
        return Promise.resolve(result);
      },
    } satisfies TestingCenterAgentDispatchEndpointDeps,
    calls: () => calls,
  };
}

Deno.test("service-role endpoint rejects unauthorized malformed and non-POST requests", async () => {
  for (
    const invalid of [
      request(""),
      request("Bearer wrong"),
      request(`Bearer ${secret}`, { contractVersion: "wrong" }),
      request(`Bearer ${secret}`, {
        contractVersion: "testing-center.agent-dispatch.v2",
        extra: true,
      }),
      new Request("https://example.test/agent-dispatch", { method: "GET" }),
    ]
  ) {
    const dependency = deps();
    const response = await handleTestingCenterAgentDispatchRequest(
      invalid,
      dependency.value,
    );
    assertEquals([400, 401, 405].includes(response.status), true);
    assertEquals(dependency.calls(), 0);
    assertEquals(response.headers.get("cache-control"), "no-store");
  }
});

Deno.test("authorized endpoint rejects declared and streamed oversized bodies", async () => {
  const streamed = request(
    `Bearer ${secret}`,
    {
      contractVersion: "testing-center.agent-dispatch.v2",
      padding: "x".repeat(600),
    },
  );
  const declared = new Request("https://example.test/agent-dispatch", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "content-length": "513",
    },
    body: JSON.stringify({
      contractVersion: "testing-center.agent-dispatch.v2",
    }),
  });
  for (const invalid of [streamed, declared]) {
    const dependency = deps();
    const response = await handleTestingCenterAgentDispatchRequest(
      invalid,
      dependency.value,
    );
    assertEquals(response.status, 400);
    assertEquals(await response.json(), { code: "invalid_request" });
    assertEquals(dependency.calls(), 0);
  }
});

Deno.test("authorized endpoint returns closed delivered idle and needs-owner results", async () => {
  for (
    const result of [
      { status: "idle" } as const,
      {
        status: "delivered",
        effectId: `${"a".repeat(64)}:triage:1`,
        target: "triage",
      } as const,
      {
        status: "needs_owner",
        effectId: `${"b".repeat(64)}:fix:1`,
        target: "fix",
      } as const,
    ]
  ) {
    const dependency = deps(result);
    const response = await handleTestingCenterAgentDispatchRequest(
      request(),
      dependency.value,
    );
    assertEquals(response.status, result.status === "needs_owner" ? 409 : 200);
    assertEquals(dependency.calls(), 1);
    assertEquals(await response.json(), {
      contractVersion: "testing-center.agent-dispatch-result.v2",
      ...result,
    });
  }
});

Deno.test("internal errors are closed and never expose diagnostics", async () => {
  const response = await handleTestingCenterAgentDispatchRequest(request(), {
    serviceRoleSecret: secret,
    dispatch: () => Promise.reject(new Error("private token and stack")),
  });
  assertEquals(response.status, 503);
  assertEquals(await response.json(), { code: "agent_dispatch_unavailable" });
});
