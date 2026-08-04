import type { LinearIssueProjection } from "./testing-center-linear-projection.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[A-Z][A-Z0-9]{0,15}-[1-9][0-9]{0,9}$/;
const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";
const LINEAR_TOKEN_URL = "https://api.linear.app/oauth/token";

export type TestingCenterLinearConfig = {
  clientId: string;
  clientSecret: string;
  organizationId: string;
  teamId: string;
  projectId: string;
  triageStateId: string;
  labelIds: Readonly<Record<string, string>>;
  workspaceSlug: string;
};

export type TestingCenterLinearCreatedIssue = {
  externalIssueId: string;
  identifier: string;
  url: string;
  organizationId: string;
};

export const TESTING_CENTER_LINEAR_DIAGNOSTIC_VERSION =
  "testing-center.linear-diagnostic.v1" as const;

export type TestingCenterLinearDiagnosticDetailCode =
  | "label_resolution_failed"
  | "issue_create_transport_failed"
  | "issue_create_invalid_json"
  | "issue_create_http_rejected"
  | "issue_create_graphql_rejected"
  | "issue_create_contract_mismatch"
  | "dispatch_exception";

export type TestingCenterLinearDiagnostic = Readonly<{
  contractVersion: typeof TESTING_CENTER_LINEAR_DIAGNOSTIC_VERSION;
  detailCode: TestingCenterLinearDiagnosticDetailCode;
  httpStatus: number | null;
  graphqlErrorCodes: readonly ("RATELIMITED" | "UNKNOWN")[];
}>;

export type TestingCenterLinearDispatchResult =
  | { status: "created"; issue: TestingCenterLinearCreatedIssue }
  | {
    status: "retryable";
    errorCode: "linear_token_transport_unavailable";
  }
  | {
    status: "ambiguous";
    errorCode: "linear_response_ambiguous";
    diagnostic: TestingCenterLinearDiagnostic;
  };

export interface TestingCenterLinearTransport {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function exactKeys(value: RecordValue, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
}

function requiredUuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export function parseTestingCenterLinearConfig(
  env: Readonly<Record<string, string | undefined>>,
): TestingCenterLinearConfig {
  const labelsValue = env.LINEAR_LABEL_IDS_JSON;
  let labels: unknown;
  try {
    labels = labelsValue === undefined ? null : JSON.parse(labelsValue);
  } catch {
    throw new Error("testing_center_linear_config_invalid");
  }
  const labelRecord = record(labels);
  const requiredLabels = [
    "testing-center",
    "needs-triage",
    "channel:nightly",
    "channel:testers",
    "status:needs-triage",
  ];
  const moduleLabels = Object.keys(labelRecord ?? {}).filter((key) =>
    key.startsWith("module:")
  );
  if (
    !env.LINEAR_CLIENT_ID || !env.LINEAR_CLIENT_SECRET ||
    !requiredUuid(env.LINEAR_ORGANIZATION_ID) ||
    !requiredUuid(env.LINEAR_TEAM_ID) || !requiredUuid(env.LINEAR_PROJECT_ID) ||
    !requiredUuid(env.LINEAR_TRIAGE_STATE_ID) ||
    env.LINEAR_WORKSPACE_SLUG !== "vantareapp" || labelRecord === null ||
    requiredLabels.some((key) => !requiredUuid(labelRecord[key])) ||
    moduleLabels.length === 0 ||
    Object.values(labelRecord).some((value) => !requiredUuid(value))
  ) {
    throw new Error("testing_center_linear_config_invalid");
  }
  return {
    clientId: env.LINEAR_CLIENT_ID,
    clientSecret: env.LINEAR_CLIENT_SECRET,
    organizationId: env.LINEAR_ORGANIZATION_ID!,
    teamId: env.LINEAR_TEAM_ID!,
    projectId: env.LINEAR_PROJECT_ID!,
    triageStateId: env.LINEAR_TRIAGE_STATE_ID!,
    labelIds: labelRecord as Record<string, string>,
    workspaceSlug: env.LINEAR_WORKSPACE_SLUG,
  };
}

function projectionLabelIds(
  projection: LinearIssueProjection,
  config: TestingCenterLinearConfig,
): string[] | null {
  const ids = projection.labels.map((label) => config.labelIds[label]);
  return ids.some((id) => !id) ? null : ids;
}

const DIAGNOSTIC_DETAIL_CODES = new Set<
  TestingCenterLinearDiagnosticDetailCode
>(
  [
    "label_resolution_failed",
    "issue_create_transport_failed",
    "issue_create_invalid_json",
    "issue_create_http_rejected",
    "issue_create_graphql_rejected",
    "issue_create_contract_mismatch",
    "dispatch_exception",
  ],
);

function safeDiagnosticDetailCode(
  detailCode: unknown,
): TestingCenterLinearDiagnosticDetailCode {
  return typeof detailCode === "string" &&
      DIAGNOSTIC_DETAIL_CODES.has(
        detailCode as TestingCenterLinearDiagnosticDetailCode,
      )
    ? detailCode as TestingCenterLinearDiagnosticDetailCode
    : "dispatch_exception";
}

function safeHttpStatus(status: unknown): number | null {
  return typeof status === "number" && Number.isInteger(status) &&
      status >= 100 && status <= 599
    ? status
    : null;
}

function safeGraphqlErrorCodes(
  codes: unknown,
): readonly ("RATELIMITED" | "UNKNOWN")[] {
  if (!Array.isArray(codes)) return [];
  const safeCodes = new Set<"RATELIMITED" | "UNKNOWN">();
  for (const code of codes.slice(0, 3)) {
    safeCodes.add(code === "RATELIMITED" ? "RATELIMITED" : "UNKNOWN");
  }
  return [...safeCodes].sort();
}

function graphqlErrorCodes(
  payload: unknown,
): readonly ("RATELIMITED" | "UNKNOWN")[] | null {
  const errors = record(payload)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const codes = new Set<"RATELIMITED" | "UNKNOWN">();
  for (const error of errors.slice(0, 3)) {
    const code = record(record(error)?.extensions)?.code;
    codes.add(code === "RATELIMITED" ? "RATELIMITED" : "UNKNOWN");
  }
  return [...codes].sort();
}

export function createTestingCenterLinearDiagnostic(
  detailCode: unknown,
  httpStatus: unknown = null,
  graphqlCodes: unknown = [],
): TestingCenterLinearDiagnostic {
  return {
    contractVersion: TESTING_CENTER_LINEAR_DIAGNOSTIC_VERSION,
    detailCode: safeDiagnosticDetailCode(detailCode),
    httpStatus: safeHttpStatus(httpStatus),
    graphqlErrorCodes: safeGraphqlErrorCodes(graphqlCodes),
  };
}

export function canonicalizeTestingCenterLinearDiagnostic(
  diagnostic: unknown,
): TestingCenterLinearDiagnostic {
  const candidate = record(diagnostic);
  return createTestingCenterLinearDiagnostic(
    candidate?.detailCode,
    candidate?.httpStatus,
    candidate?.graphqlErrorCodes,
  );
}

function ambiguous(
  detailCode: TestingCenterLinearDiagnosticDetailCode,
  httpStatus: number | null = null,
  graphqlCodes: readonly ("RATELIMITED" | "UNKNOWN")[] = [],
): TestingCenterLinearDispatchResult {
  return {
    status: "ambiguous",
    errorCode: "linear_response_ambiguous",
    diagnostic: createTestingCenterLinearDiagnostic(
      detailCode,
      httpStatus,
      graphqlCodes,
    ),
  };
}

async function acquireToken(
  config: TestingCenterLinearConfig,
  transport: TestingCenterLinearTransport,
): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "issues:create",
  });
  let authorization: string;
  try {
    authorization = btoa(`${config.clientId}:${config.clientSecret}`);
  } catch {
    return null;
  }
  let response: Response;
  try {
    response = await transport.fetch(LINEAR_TOKEN_URL, {
      method: "POST",
      headers: {
        "authorization": `Basic ${authorization}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  const token = record(payload)?.access_token;
  return typeof token === "string" && token.length >= 32 && token.length <= 4096
    ? token
    : null;
}

const ISSUE_CREATE_MUTATION =
  `mutation TestingCenterIssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      url
      team { id }
      project { id }
      state { id }
      labels { nodes { id } }
    }
  }
}`;

function decodeCreatedIssue(
  payload: unknown,
  config: TestingCenterLinearConfig,
  expectedLabelIds: readonly string[],
): TestingCenterLinearCreatedIssue | null {
  const root = record(payload);
  if (!root || !exactKeys(root, ["data"]) || root.errors !== undefined) {
    return null;
  }
  const data = record(root.data);
  const create = record(data?.issueCreate);
  const issue = record(create?.issue);
  const team = record(issue?.team);
  const project = record(issue?.project);
  const state = record(issue?.state);
  const labels = record(issue?.labels);
  const nodes = Array.isArray(labels?.nodes) ? labels.nodes : null;
  if (
    !data || !exactKeys(data, ["issueCreate"]) || !create ||
    !exactKeys(create, ["issue", "success"]) || create.success !== true ||
    !issue ||
    !exactKeys(issue, [
      "id",
      "identifier",
      "labels",
      "project",
      "state",
      "team",
      "url",
    ]) ||
    !team || !exactKeys(team, ["id"]) || team.id !== config.teamId ||
    !project || !exactKeys(project, ["id"]) ||
    project.id !== config.projectId ||
    !state || !exactKeys(state, ["id"]) || state.id !== config.triageStateId ||
    !labels || !exactKeys(labels, ["nodes"]) || nodes === null
  ) return null;
  const actualLabelIds = nodes.map((node) => {
    const item = record(node);
    return item && exactKeys(item, ["id"]) ? requiredUuid(item.id) : null;
  });
  if (
    actualLabelIds.some((id) => id === null) ||
    [...actualLabelIds].sort().join(",") !==
      [...expectedLabelIds].sort().join(",")
  ) return null;
  const id = requiredUuid(issue.id);
  const identifier = typeof issue.identifier === "string" &&
      IDENTIFIER.test(issue.identifier)
    ? issue.identifier
    : null;
  const expectedPrefix = identifier === null
    ? ""
    : `https://linear.app/${config.workspaceSlug}/issue/${identifier}/`;
  const url =
    typeof issue.url === "string" && issue.url.startsWith(expectedPrefix)
      ? issue.url
      : null;
  if (!id || !identifier || !url) return null;
  return {
    externalIssueId: id,
    identifier,
    url,
    organizationId: config.organizationId,
  };
}

export async function createTestingCenterLinearIssue(
  projection: LinearIssueProjection,
  config: TestingCenterLinearConfig,
  transport: TestingCenterLinearTransport = { fetch: globalThis.fetch },
): Promise<TestingCenterLinearDispatchResult> {
  const labelIds = projectionLabelIds(projection, config);
  if (labelIds === null) {
    return ambiguous("label_resolution_failed");
  }
  const token = await acquireToken(config, transport);
  if (token === null) {
    return {
      status: "retryable",
      errorCode: "linear_token_transport_unavailable",
    };
  }
  let response: Response;
  try {
    response = await transport.fetch(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: ISSUE_CREATE_MUTATION,
        variables: {
          input: {
            title: projection.title,
            description: projection.description,
            teamId: config.teamId,
            projectId: config.projectId,
            stateId: config.triageStateId,
            labelIds,
          },
        },
      }),
    });
  } catch {
    return ambiguous("issue_create_transport_failed");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return ambiguous("issue_create_invalid_json", response.status);
  }
  const errorCodes = graphqlErrorCodes(payload);
  if (errorCodes !== null) {
    return ambiguous(
      "issue_create_graphql_rejected",
      response.status,
      errorCodes,
    );
  }
  if (!response.ok) {
    return ambiguous("issue_create_http_rejected", response.status);
  }
  const issue = decodeCreatedIssue(payload, config, labelIds);
  return issue
    ? { status: "created", issue }
    : ambiguous("issue_create_contract_mismatch", response.status);
}
