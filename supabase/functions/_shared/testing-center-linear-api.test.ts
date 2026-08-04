import {
  createTestingCenterLinearIssue,
  parseTestingCenterLinearConfig,
  type TestingCenterLinearConfig,
  type TestingCenterLinearTransport,
} from "./testing-center-linear-api.ts";
import {
  buildTestingCenterLinearIssueProjection,
  TESTING_CENTER_LINEAR_PROJECTION_VERSION,
} from "./testing-center-linear-projection.ts";

const ids = {
  organization: "10000000-0000-4000-8000-000000000001",
  team: "10000000-0000-4000-8000-000000000002",
  project: "10000000-0000-4000-8000-000000000003",
  state: "10000000-0000-4000-8000-000000000004",
  testing: "10000000-0000-4000-8000-000000000005",
  triage: "10000000-0000-4000-8000-000000000006",
  nightly: "10000000-0000-4000-8000-000000000007",
  testers: "10000000-0000-4000-8000-000000000008",
  module: "10000000-0000-4000-8000-000000000009",
  status: "10000000-0000-4000-8000-00000000000a",
  issue: "10000000-0000-4000-8000-00000000000b",
};

function config(): TestingCenterLinearConfig {
  return parseTestingCenterLinearConfig({
    LINEAR_CLIENT_ID: "client-id",
    LINEAR_CLIENT_SECRET: "client-secret-that-is-long-enough",
    LINEAR_ORGANIZATION_ID: ids.organization,
    LINEAR_TEAM_ID: ids.team,
    LINEAR_PROJECT_ID: ids.project,
    LINEAR_TRIAGE_STATE_ID: ids.state,
    LINEAR_WORKSPACE_SLUG: "vantareapp",
    LINEAR_LABEL_IDS_JSON: JSON.stringify({
      "testing-center": ids.testing,
      "needs-triage": ids.triage,
      "channel:nightly": ids.nightly,
      "channel:testers": ids.testers,
      "module:testing_center": ids.module,
      "status:needs-triage": ids.status,
    }),
  });
}

async function projection() {
  return await buildTestingCenterLinearIssueProjection({
    contractVersion: TESTING_CENTER_LINEAR_PROJECTION_VERSION,
    effectId: `effect_${"1".repeat(64)}`,
    technicalIssueId: `issue_${"2".repeat(64)}`,
    sourceDigest: "3".repeat(64),
    occurrenceCount: 2,
    replayAvailable: false,
    report: {
      reportId: `report_${"4".repeat(64)}`,
      channel: "nightly",
      appVersion: "0.1.0-nightly",
      osFamily: "windows",
      osVersion: "Windows 11",
      module: "testing_center",
      actionText: "Abrir el Testing Center",
      expectedText: "Ver la candidatura",
      observedText: "La lista queda vacía",
      contextText: null,
      errorCode: "candidate.empty",
      candidateSha: "5".repeat(40),
    },
  });
}

function createdPayload(labelIds: string[]) {
  return {
    data: {
      issueCreate: {
        success: true,
        issue: {
          id: ids.issue,
          identifier: "ISA-999",
          url: "https://linear.app/vantareapp/issue/ISA-999/testing-center",
          team: { id: ids.team },
          project: { id: ids.project },
          state: { id: ids.state },
          labels: { nodes: labelIds.map((id) => ({ id })) },
        },
      },
    },
  };
}

Deno.test("Linear pilot uses client credentials with issues:create and fixed GraphQL", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const transport: TestingCenterLinearTransport = {
    fetch(input, init) {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/oauth/token")) {
        return Promise.resolve(
          Response.json({ access_token: "t".repeat(64) }),
        );
      }
      return Promise.resolve(
        Response.json(createdPayload([
          ids.testing,
          ids.triage,
          ids.nightly,
          ids.module,
          ids.status,
        ])),
      );
    },
  };
  const result = await createTestingCenterLinearIssue(
    await projection(),
    config(),
    transport,
  );
  if (result.status !== "created" || result.issue.identifier !== "ISA-999") {
    throw new Error(`unexpected result: ${JSON.stringify(result)}`);
  }
  const tokenBody = calls[0].init?.body as URLSearchParams;
  if (tokenBody.get("scope") !== "issues:create") {
    throw new Error("client credentials scope is not least privilege");
  }
  const mutation = JSON.parse(String(calls[1].init?.body));
  if (
    mutation.query.includes("Abrir el Testing Center") ||
    mutation.variables.input.assigneeId !== undefined ||
    mutation.variables.input.priority !== undefined
  ) throw new Error("untrusted or forbidden fields leaked into GraphQL query");
});

Deno.test("token failure is the only automatically retryable network stage", async () => {
  const result = await createTestingCenterLinearIssue(
    await projection(),
    config(),
    { fetch: () => Promise.reject(new Error("offline")) },
  );
  if (result.status !== "retryable") {
    throw new Error(`unexpected result: ${JSON.stringify(result)}`);
  }
});

Deno.test("any uncertainty after issueCreate is sent becomes needs-owner ambiguity", async () => {
  let call = 0;
  const result = await createTestingCenterLinearIssue(
    await projection(),
    config(),
    {
      fetch() {
        call++;
        return call === 1
          ? Promise.resolve(Response.json({ access_token: "t".repeat(64) }))
          : Promise.reject(new Error("connection reset"));
      },
    },
  );
  if (
    result.status !== "ambiguous" ||
    result.diagnostic.detailCode !== "issue_create_transport_failed" ||
    result.diagnostic.httpStatus !== null ||
    result.diagnostic.graphqlErrorCodes.length !== 0
  ) {
    throw new Error(`unexpected result: ${JSON.stringify(result)}`);
  }
});

Deno.test("GraphQL diagnostics expose only allowlisted bounded metadata", async () => {
  let call = 0;
  const privateMessage = "secret tester title and token must never escape";
  const result = await createTestingCenterLinearIssue(
    await projection(),
    config(),
    {
      fetch() {
        call++;
        return Promise.resolve(
          call === 1
            ? Response.json({ access_token: "t".repeat(64) })
            : Response.json({
              data: null,
              errors: [
                {
                  message: privateMessage,
                  path: ["issueCreate", privateMessage],
                  extensions: {
                    code: "RATELIMITED",
                    privateToken: privateMessage,
                  },
                },
                {
                  message: privateMessage,
                  extensions: { code: "LEAK_PRIVATE_CONTEXT" },
                },
                {
                  message: privateMessage,
                  extensions: { code: "RATELIMITED" },
                },
                {
                  message: privateMessage,
                  extensions: { code: "ANOTHER_PRIVATE_CODE" },
                },
              ],
            }, { status: 400 }),
        );
      },
    },
  );
  const serialized = JSON.stringify(result);
  if (
    result.status !== "ambiguous" ||
    result.diagnostic.detailCode !== "issue_create_graphql_rejected" ||
    result.diagnostic.httpStatus !== 400 ||
    result.diagnostic.graphqlErrorCodes.join(",") !== "RATELIMITED,UNKNOWN" ||
    serialized.includes(privateMessage) ||
    serialized.includes("LEAK_PRIVATE_CONTEXT") ||
    serialized.includes("ANOTHER_PRIVATE_CODE")
  ) throw new Error(`unsafe GraphQL diagnostic: ${serialized}`);
});

Deno.test("HTTP rejection never echoes response payload", async () => {
  let call = 0;
  const privatePayload = "private upstream payload";
  const result = await createTestingCenterLinearIssue(
    await projection(),
    config(),
    {
      fetch() {
        call++;
        return Promise.resolve(
          call === 1
            ? Response.json({ access_token: "t".repeat(64) })
            : Response.json({ privatePayload }, { status: 503 }),
        );
      },
    },
  );
  const serialized = JSON.stringify(result);
  if (
    result.status !== "ambiguous" ||
    result.diagnostic.detailCode !== "issue_create_http_rejected" ||
    result.diagnostic.httpStatus !== 503 || serialized.includes(privatePayload)
  ) throw new Error(`unsafe HTTP diagnostic: ${serialized}`);
});

Deno.test("invalid JSON response exposes status but never response bytes", async () => {
  let call = 0;
  const privateBody = "private non-json upstream response";
  const result = await createTestingCenterLinearIssue(
    await projection(),
    config(),
    {
      fetch() {
        call++;
        return Promise.resolve(
          call === 1
            ? Response.json({ access_token: "t".repeat(64) })
            : new Response(privateBody, { status: 502 }),
        );
      },
    },
  );
  const serialized = JSON.stringify(result);
  if (
    result.status !== "ambiguous" ||
    result.diagnostic.detailCode !== "issue_create_invalid_json" ||
    result.diagnostic.httpStatus !== 502 || serialized.includes(privateBody)
  ) throw new Error(`unsafe invalid-JSON diagnostic: ${serialized}`);
});

Deno.test("unresolved label fails before network with a closed diagnostic", async () => {
  const missingModuleConfig = parseTestingCenterLinearConfig({
    LINEAR_CLIENT_ID: "client-id",
    LINEAR_CLIENT_SECRET: "client-secret-that-is-long-enough",
    LINEAR_ORGANIZATION_ID: ids.organization,
    LINEAR_TEAM_ID: ids.team,
    LINEAR_PROJECT_ID: ids.project,
    LINEAR_TRIAGE_STATE_ID: ids.state,
    LINEAR_WORKSPACE_SLUG: "vantareapp",
    LINEAR_LABEL_IDS_JSON: JSON.stringify({
      "testing-center": ids.testing,
      "needs-triage": ids.triage,
      "channel:nightly": ids.nightly,
      "channel:testers": ids.testers,
      "module:other": ids.module,
      "status:needs-triage": ids.status,
    }),
  });
  let calls = 0;
  const result = await createTestingCenterLinearIssue(
    await projection(),
    missingModuleConfig,
    {
      fetch: () => {
        calls++;
        throw new Error("must not call network");
      },
    },
  );
  if (
    calls !== 0 || result.status !== "ambiguous" ||
    result.diagnostic.detailCode !== "label_resolution_failed" ||
    result.diagnostic.httpStatus !== null ||
    result.diagnostic.graphqlErrorCodes.length !== 0
  ) throw new Error(`unsafe label diagnostic: ${JSON.stringify(result)}`);
});

Deno.test("created response must match team project state labels and Vantare URL", async () => {
  let call = 0;
  const result = await createTestingCenterLinearIssue(
    await projection(),
    config(),
    {
      fetch() {
        call++;
        return Promise.resolve(
          call === 1
            ? Response.json({ access_token: "t".repeat(64) })
            : Response.json(createdPayload([ids.testing])),
        );
      },
    },
  );
  if (
    result.status !== "ambiguous" ||
    result.diagnostic.detailCode !== "issue_create_contract_mismatch" ||
    result.diagnostic.httpStatus !== 200
  ) {
    throw new Error("incomplete Linear response was accepted");
  }
});

Deno.test("configuration is closed and requires server-owned UUID mappings", () => {
  let code = "";
  try {
    parseTestingCenterLinearConfig({
      LINEAR_CLIENT_ID: "client",
      LINEAR_CLIENT_SECRET: "secret",
      LINEAR_WORKSPACE_SLUG: "vantareapp",
      LINEAR_LABEL_IDS_JSON: "{}",
    });
  } catch (error) {
    code = error instanceof Error ? error.message : "unknown";
  }
  if (code !== "testing_center_linear_config_invalid") {
    throw new Error("invalid configuration did not fail closed");
  }
});
