import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  createTestingCenterLinearIssue,
  parseTestingCenterLinearConfig,
} from "../_shared/testing-center-linear-api.ts";
import {
  handleTestingCenterLinearPilotRequest,
} from "../_shared/testing-center-linear-pilot.ts";
import { createTestingCenterLinearPilotStore } from "../_shared/testing-center-linear-supabase-store.ts";

function environment(): Record<string, string | undefined> {
  return {
    LINEAR_CLIENT_ID: Deno.env.get("LINEAR_CLIENT_ID"),
    LINEAR_CLIENT_SECRET: Deno.env.get("LINEAR_CLIENT_SECRET"),
    LINEAR_ORGANIZATION_ID: Deno.env.get("LINEAR_ORGANIZATION_ID"),
    LINEAR_TEAM_ID: Deno.env.get("LINEAR_TEAM_ID"),
    LINEAR_PROJECT_ID: Deno.env.get("LINEAR_PROJECT_ID"),
    LINEAR_TRIAGE_STATE_ID: Deno.env.get("LINEAR_TRIAGE_STATE_ID"),
    LINEAR_LABEL_IDS_JSON: Deno.env.get("LINEAR_LABEL_IDS_JSON"),
    LINEAR_WORKSPACE_SLUG: Deno.env.get("LINEAR_WORKSPACE_SLUG"),
  };
}

export async function handleRequest(request: Request): Promise<Response> {
  let config;
  try {
    config = parseTestingCenterLinearConfig(environment());
  } catch {
    return Response.json({ code: "pilot_configuration_invalid" }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
  return await handleTestingCenterLinearPilotRequest(request, {
    store: createTestingCenterLinearPilotStore(getSupabaseAdmin()),
    dispatch: (projection) =>
      createTestingCenterLinearIssue(projection, config),
    pilotSecret: Deno.env.get("TESTING_CENTER_LINEAR_PILOT_SECRET") ?? "",
    workerId: "isa243-linear-pilot",
  });
}

if (import.meta.main) Deno.serve(handleRequest);
