import { sanitizeTestingCenterTesterText } from "./testing-center-projection-sanitization.ts";

export const TESTING_CENTER_AGENT_TRIAGE_VERSION =
  "testing-center.agent-triage.v2" as const;

export const TESTING_CENTER_AGENT_TRIAGE_MAX_BYTES = 32 * 1024;

export type TestingCenterAgentTriage = {
  contractVersion: typeof TESTING_CENTER_AGENT_TRIAGE_VERSION;
  classification: "bug" | "duplicate" | "needs_info" | "ineligible";
  duplicateOf: string | null;
  reproduction: {
    steps: string[];
    expected: string;
    observed: string;
  };
  acceptanceCriteria: string[];
  proposedTestCommandId:
    | "go.test.focal"
    | "frontend.test.focal"
    | "frontend.visual.testing-center";
  candidatePaths: string[];
  risk: "low" | "medium" | "high";
  uncertainties: string[];
};

export type TestingCenterTriageAuthority = {
  jobKey: string;
  technicalIssueId: string;
  dossierDigest: string;
  policyVersion: "testing-center.autofix-policy.v2";
  nightlyBaseSha: string;
  allowedPathPrefixes: readonly string[];
  maxFiles: number;
  killSwitchPaused: boolean;
};

export type TestingCenterComposedTriage = {
  triage: TestingCenterAgentTriage;
  authority: {
    repository: "isaacalbala12/Vantare-Simracing-Suite";
    baseRef: "nightly";
    baseSha: string;
    jobKey: string;
    technicalIssueId: string;
    dossierDigest: string;
    policyVersion: "testing-center.autofix-policy.v2";
    maxFiles: number;
    killSwitchPaused: boolean;
  };
};

const OUTPUT_KEYS = [
  "contractVersion",
  "classification",
  "duplicateOf",
  "reproduction",
  "acceptanceCriteria",
  "proposedTestCommandId",
  "candidatePaths",
  "risk",
  "uncertainties",
] as const;

const COMMAND_IDS = new Set([
  "go.test.focal",
  "frontend.test.focal",
  "frontend.visual.testing-center",
]);

const INJECTION =
  /(?:ignore|disregard|override|forget|ignora|omite|anula|reemplaza|olvida)[\s\S]{0,1024}(?:instructions?|policy|prompt|rules?|instrucciones?|pol[ií]tica|reglas?)|(?:new\s+instructions?|nuevas?\s+reglas?|you\s+are\s+now\b|\bDAN\b)|system\s+prompt|developer\s+message|mensaje\s+(?:del?\s+)?sistema|(?:call|invoke|invoca)\s+(?:the\s+)?tool|(?:(?:run|execute|invoke|ejecuta|invoca)\s+)?(?:curl|wget|powershell|cmd(?:\.exe)?|bash|sudo\s+rm|rm\s+-|python\s+-)|<\s*script/iu;

const UNSAFE_TEXT =
  /\p{Cf}|[\uD800-\uDFFF]|(?:^|[\s('"`])\/[A-Za-z0-9._-]+(?:\/|\b)|\b(?:https?|hxxps?):\/\/|\bwww\.|\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b|\bgh[pousr]_[A-Za-z0-9]{8,}\b|\bBearer\s+[A-Za-z0-9._~+\/-]{12,}\b|\b(?:api[_-]?key|token|secret)\s*[:=]\s*\S+/iu;

const BARE_DOMAIN = /\b(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}(?:[\/:?]|\b)/iu;

const SAFE_REPOSITORY_FILENAME =
  /\b[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|go|json|md|css|scss|sql|ya?ml|html)\b(?![\/:?])/giu;

function invalid(): never {
  throw new Error("testing_center_agent_triage_invalid");
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length &&
    actual.every((key) => keys.includes(key));
}

function normalizedText(value: string): string {
  return value.normalize("NFKC").replace(/\r\n?/g, "\n").replace(
    /[ \t]+$/gm,
    "",
  )
    .trim();
}

function parseSafeText(
  value: unknown,
  maxBytes: number,
  allowEmpty = false,
): string {
  if (typeof value !== "string") invalid();
  if (value.length > maxBytes) invalid();
  const normalized = normalizedText(value);
  const proseWithoutRepositoryFilenames = normalized.replace(
    SAFE_REPOSITORY_FILENAME,
    "",
  );
  if (
    (!allowEmpty && normalized.length === 0) ||
    new TextEncoder().encode(normalized).length > maxBytes ||
    INJECTION.test(normalized) || UNSAFE_TEXT.test(normalized) ||
    BARE_DOMAIN.test(proseWithoutRepositoryFilenames)
  ) invalid();
  const sanitized = sanitizeTestingCenterTesterText(normalized, maxBytes);
  if (
    sanitized.redactedValues > 0 || sanitized.truncated ||
    sanitized.value !== normalized
  ) invalid();
  return normalized;
}

function parseTextArray(
  value: unknown,
  minItems: number,
  maxItems: number,
  maxItemBytes = 1024,
): string[] {
  if (
    !Array.isArray(value) || value.length < minItems || value.length > maxItems
  ) {
    invalid();
  }
  const parsed = value.map((item) => parseSafeText(item, maxItemBytes));
  if (new Set(parsed).size !== parsed.length) invalid();
  return parsed;
}

function validRepositoryPath(
  path: string,
  prefixes: readonly string[],
): boolean {
  const segments = path.split("/");
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const lastSegment = segments.at(-1) ?? "";
  if (
    path.length > 500 || path.includes("\\") || path.startsWith("/") ||
    path.endsWith("/") || /^[A-Za-z]:/.test(path) ||
    segments.some((segment) =>
      segment.length === 0 || segment === "." || segment === ".." ||
      segment.startsWith(".")
    ) || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9._-]+$/.test(lastSegment) ||
    !/^[A-Za-z0-9._/-]+$/.test(path) ||
    lowerSegments.includes(".github") ||
    lowerSegments.some((segment, index) =>
      segment === "supabase" &&
      ["migrations", "rollbacks"].includes(lowerSegments[index + 1] ?? "")
    )
  ) return false;
  return prefixes.some((prefix) => path.startsWith(prefix));
}

function validatePrefixes(prefixes: readonly string[]): void {
  if (
    !Array.isArray(prefixes) || prefixes.length === 0 || prefixes.length > 5 ||
    new Set(prefixes).size !== prefixes.length ||
    prefixes.some((prefix) => {
      if (
        typeof prefix !== "string" || !prefix.endsWith("/") ||
        !/^[A-Za-z0-9._/-]+$/.test(prefix) || prefix.startsWith("/")
      ) return true;
      const segments = prefix.slice(0, -1).split("/");
      const lowerSegments = segments.map((segment) => segment.toLowerCase());
      return segments.some((segment) =>
        segment.length === 0 || segment === "." || segment === ".." ||
        segment.startsWith(".")
      ) || lowerSegments.includes(".github") ||
        lowerSegments.some((segment, index) =>
          segment === "supabase" &&
          ["migrations", "rollbacks"].includes(lowerSegments[index + 1] ?? "")
        );
    })
  ) invalid();
}

export function parseAgentTriage(
  value: unknown,
  allowedPathPrefixes: readonly string[],
): TestingCenterAgentTriage {
  validatePrefixes(allowedPathPrefixes);
  if (
    !record(value) || !exact(value, OUTPUT_KEYS)
  ) invalid();

  if (
    value.contractVersion !== TESTING_CENTER_AGENT_TRIAGE_VERSION ||
    !["bug", "duplicate", "needs_info", "ineligible"].includes(
      value.classification as string,
    ) || !record(value.reproduction) ||
    !exact(value.reproduction, ["steps", "expected", "observed"]) ||
    !COMMAND_IDS.has(value.proposedTestCommandId as string) ||
    !["low", "medium", "high"].includes(value.risk as string)
  ) invalid();

  const classification = value
    .classification as TestingCenterAgentTriage["classification"];
  const reproduction = {
    steps: parseTextArray(
      value.reproduction.steps,
      classification === "bug" ? 1 : 0,
      10,
    ),
    expected: parseSafeText(
      value.reproduction.expected,
      2048,
      classification !== "bug",
    ),
    observed: parseSafeText(
      value.reproduction.observed,
      2048,
      classification !== "bug",
    ),
  };
  const acceptanceCriteria = parseTextArray(
    value.acceptanceCriteria,
    classification === "bug" ? 1 : 0,
    classification === "duplicate" ? 0 : 10,
  );
  const uncertainties = parseTextArray(value.uncertainties, 0, 10);

  if (!Array.isArray(value.candidatePaths) || value.candidatePaths.length > 5) {
    invalid();
  }
  const candidatePaths = value.candidatePaths.map((path) => {
    if (
      typeof path !== "string" ||
      !validRepositoryPath(path, allowedPathPrefixes)
    ) {
      invalid();
    }
    return path;
  });
  if (
    new Set(candidatePaths).size !== candidatePaths.length ||
    (classification === "bug" && candidatePaths.length === 0) ||
    (classification !== "bug" && candidatePaths.length !== 0)
  ) invalid();

  let duplicateOf: string | null;
  if (classification === "duplicate") {
    if (
      typeof value.duplicateOf !== "string" ||
      !/^issue_[0-9a-f]{64}$/.test(value.duplicateOf)
    ) invalid();
    duplicateOf = value.duplicateOf;
  } else {
    if (value.duplicateOf !== null) invalid();
    duplicateOf = null;
  }

  const parsed: TestingCenterAgentTriage = {
    contractVersion: TESTING_CENTER_AGENT_TRIAGE_VERSION,
    classification,
    duplicateOf,
    reproduction,
    acceptanceCriteria,
    proposedTestCommandId: value
      .proposedTestCommandId as TestingCenterAgentTriage[
        "proposedTestCommandId"
      ],
    candidatePaths,
    risk: value.risk as TestingCenterAgentTriage["risk"],
    uncertainties,
  };
  if (
    new TextEncoder().encode(JSON.stringify(parsed)).length >
      TESTING_CENTER_AGENT_TRIAGE_MAX_BYTES
  ) invalid();
  return parsed;
}

function assertNoDuplicateJsonKeys(rawJson: string): void {
  let position = 0;
  const maxDepth = 64;
  const whitespace = () => {
    while (/\s/.test(rawJson[position] ?? "")) position++;
  };
  const string = (): string => {
    const start = position;
    if (rawJson[position++] !== '"') invalid();
    while (position < rawJson.length) {
      if (rawJson[position] === "\\") {
        position += 2;
      } else if (rawJson[position++] === '"') {
        try {
          return JSON.parse(rawJson.slice(start, position));
        } catch {
          invalid();
        }
      }
    }
    invalid();
  };
  const value = (depth = 0): void => {
    if (depth > maxDepth) invalid();
    whitespace();
    if (rawJson[position] === "{") {
      position++;
      whitespace();
      const keys = new Set<string>();
      if (rawJson[position] === "}") {
        position++;
        return;
      }
      while (position < rawJson.length) {
        whitespace();
        const key = string();
        if (keys.has(key)) invalid();
        keys.add(key);
        whitespace();
        if (rawJson[position++] !== ":") invalid();
        value(depth + 1);
        whitespace();
        const delimiter = rawJson[position++];
        if (delimiter === "}") return;
        if (delimiter !== ",") invalid();
      }
      invalid();
    }
    if (rawJson[position] === "[") {
      position++;
      whitespace();
      if (rawJson[position] === "]") {
        position++;
        return;
      }
      while (position < rawJson.length) {
        value(depth + 1);
        whitespace();
        const delimiter = rawJson[position++];
        if (delimiter === "]") return;
        if (delimiter !== ",") invalid();
      }
      invalid();
    }
    if (rawJson[position] === '"') {
      string();
      return;
    }
    const start = position;
    while (position < rawJson.length && !/[\s,}\]]/.test(rawJson[position])) {
      position++;
    }
    if (start === position) invalid();
  };
  value();
  whitespace();
  if (position !== rawJson.length) invalid();
}

export function parseAgentTriageJson(
  rawJson: string,
  allowedPathPrefixes: readonly string[],
): TestingCenterAgentTriage {
  if (
    typeof rawJson !== "string" ||
    new TextEncoder().encode(rawJson).length >
      TESTING_CENTER_AGENT_TRIAGE_MAX_BYTES
  ) invalid();
  assertNoDuplicateJsonKeys(rawJson);
  let value: unknown;
  try {
    value = JSON.parse(rawJson);
  } catch {
    invalid();
  }
  return parseAgentTriage(value, allowedPathPrefixes);
}

export function composeAgentTriage(
  value: unknown,
  authority: TestingCenterTriageAuthority,
): TestingCenterComposedTriage {
  validatePrefixes(authority.allowedPathPrefixes);
  if (
    !/^[0-9a-f]{64}$/.test(authority.jobKey) ||
    !/^issue_[0-9a-f]{64}$/.test(authority.technicalIssueId) ||
    !/^[0-9a-f]{64}$/.test(authority.dossierDigest) ||
    authority.policyVersion !== "testing-center.autofix-policy.v2" ||
    !/^[0-9a-f]{40}$/.test(authority.nightlyBaseSha) ||
    !Number.isSafeInteger(authority.maxFiles) || authority.maxFiles < 1 ||
    authority.maxFiles > 5 || authority.killSwitchPaused !== false
  ) invalid();
  const triage = parseAgentTriage(value, authority.allowedPathPrefixes);
  if (triage.candidatePaths.length > authority.maxFiles) invalid();
  return {
    triage,
    authority: {
      repository: "isaacalbala12/Vantare-Simracing-Suite",
      baseRef: "nightly",
      baseSha: authority.nightlyBaseSha,
      jobKey: authority.jobKey,
      technicalIssueId: authority.technicalIssueId,
      dossierDigest: authority.dossierDigest,
      policyVersion: authority.policyVersion,
      maxFiles: authority.maxFiles,
      killSwitchPaused: authority.killSwitchPaused,
    },
  };
}
