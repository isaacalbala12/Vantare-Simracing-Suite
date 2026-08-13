import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  createTestingCenterAgentEffectStore,
  createTestingCenterGitHubAppDispatcher,
  dispatchNextTestingCenterAgentEffect,
  parseTestingCenterGitHubAppConfig,
  type TestingCenterAgentDispatchResult,
} from "../_shared/testing-center-github-dispatch.ts";
import { readJsonObject } from "../_shared/request.ts";

const ENCODER = new TextEncoder();

export type TestingCenterAgentDispatchEndpointDeps = {
  serviceRoleSecret: string;
  dispatch(): Promise<TestingCenterAgentDispatchResult>;
};

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftBytes = ENCODER.encode(left);
  const rightBytes = ENCODER.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index++) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function exactContract(value: Record<string, unknown>): boolean {
  return Object.keys(value).length === 1 &&
    value.contractVersion === "testing-center.agent-dispatch.v2";
}

export async function handleTestingCenterAgentDispatchRequest(
  request: Request,
  deps: TestingCenterAgentDispatchEndpointDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (
    deps.serviceRoleSecret.length < 32 ||
    deps.serviceRoleSecret.length > 4096 ||
    !constantTimeTextEqual(
      authorization,
      `Bearer ${deps.serviceRoleSecret}`,
    )
  ) return json({ code: "unauthorized" }, 401);

  const parsed = await readJsonObject(request, 512);
  if (!parsed.ok || !exactContract(parsed.value)) {
    return json({ code: "invalid_request" }, 400);
  }
  try {
    const result = await deps.dispatch();
    return json({
      contractVersion: "testing-center.agent-dispatch-result.v2",
      ...result,
    }, result.status === "needs_owner" ? 409 : 200);
  } catch {
    return json({ code: "agent_dispatch_unavailable" }, 503);
  }
}

function productionDependencies(): TestingCenterAgentDispatchEndpointDeps {
  const serviceRoleSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return {
    serviceRoleSecret,
    dispatch: () => {
      const github = createTestingCenterGitHubAppDispatcher(
        parseTestingCenterGitHubAppConfig({
          TESTING_CENTER_GITHUB_APP_ID: Deno.env.get(
            "TESTING_CENTER_GITHUB_APP_ID",
          ),
          TESTING_CENTER_GITHUB_APP_INSTALLATION_ID: Deno.env.get(
            "TESTING_CENTER_GITHUB_APP_INSTALLATION_ID",
          ),
          TESTING_CENTER_GITHUB_APP_PRIVATE_KEY: Deno.env.get(
            "TESTING_CENTER_GITHUB_APP_PRIVATE_KEY",
          ),
        }),
      );
      return dispatchNextTestingCenterAgentEffect({
        store: createTestingCenterAgentEffectStore(getSupabaseAdmin()),
        github,
        workerId: "isa321-github-dispatch",
        leaseSeconds: 120,
      });
    },
  };
}

export async function handleRequest(request: Request): Promise<Response> {
  try {
    return await handleTestingCenterAgentDispatchRequest(
      request,
      productionDependencies(),
    );
  } catch {
    return json({ code: "agent_dispatch_configuration_invalid" }, 503);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
