const workflowPath = ".github/workflows/testing-center-agent-fix.yml";
const redPromptPath = ".github/agents/testing-center-red-prompt.md";
const greenPromptPath = ".github/agents/testing-center-green-prompt.md";
const settingsPath = ".github/agents/testing-center-agent-settings.json";

const checkoutPin = "actions/checkout@11d5960a326750d5838078e36cf38b85af677262";
const setupDenoPin =
  "denoland/setup-deno@667a34cdef165d8d2b2e98dde39547c9daac7282";
const claudeActionPin =
  "anthropics/claude-code-action@dfb8fc798e1a98ff989c587a166b75010bfe2639";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIncludes(actual: string, expected: string): void {
  assert(actual.includes(expected), `Expected text to include: ${expected}`);
}

function assertNotIncludes(actual: string, forbidden: string): void {
  assert(!actual.includes(forbidden), `Forbidden text found: ${forbidden}`);
}

function assertNotMatch(actual: string, forbidden: RegExp): void {
  assert(!forbidden.test(actual), `Forbidden pattern found: ${forbidden}`);
}

function assertEquals(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(
    actualJson === expectedJson,
    `${message}: ${actualJson} !== ${expectedJson}`,
  );
}

function normalize(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jobBlock(workflow: string, jobName: string): string {
  const lines = normalize(workflow).split("\n");
  const jobsIndex = lines.findIndex((line) => line === "jobs:");
  assert(jobsIndex >= 0, "Missing jobs mapping");

  const header = new RegExp(`^  ${escapeRegExp(jobName)}:\\s*$`);
  const start = lines.findIndex((line, index) =>
    index > jobsIndex && header.test(line)
  );
  assert(start >= 0, `Missing job: ${jobName}`);

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^[ ]{2}[A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function usesLines(block: string): string[] {
  return block.split("\n").map((line) => line.trim()).filter((line) =>
    line.startsWith("uses:")
  );
}

Deno.test("workflow exposes only the two approved triggers with read-only contents", async () => {
  const workflow = normalize(await Deno.readTextFile(workflowPath));

  assertIncludes(
    workflow,
    "repository_dispatch:\n    types: [testing-center-agent-fix]",
  );
  assertIncludes(workflow, "workflow_dispatch:\n    inputs:\n      fixture:");
  assertIncludes(workflow, "fixture:\n        description:");
  assertIncludes(workflow, "required: true");
  assertIncludes(workflow, "permissions:\n  contents: read");

  for (
    const forbidden of [
      "pull_request_target:",
      "pull_request:",
      "push:",
      "schedule:",
      "workflow_call:",
      "@main",
      "@latest",
      "contents: write",
      "pull-requests:",
      "write-all",
      "git push",
      "gh pr",
      "create-pull-request",
      "merge:",
      "release:",
    ]
  ) assertNotIncludes(workflow, forbidden);

  for (
    const forbidden of [
      /\b(?:git|gh)\s+push\b/i,
      /\bgh\s+pr\b/i,
      /\b(?:git|gh)\s+merge\b/i,
      /\bgh\s+release\b/i,
    ]
  ) assertNotMatch(workflow, forbidden);
});

Deno.test("manual fixture is isolated allowlisted and runs only the local cached contract", async () => {
  const workflow = normalize(await Deno.readTextFile(workflowPath));
  const fixture = jobBlock(workflow, "fixture");

  assertIncludes(fixture, "if: github.event_name == 'workflow_dispatch'");
  assertEquals(usesLines(fixture), [
    `uses: ${checkoutPin}`,
    `uses: ${setupDenoPin}`,
  ], "fixture actions");
  assertIncludes(fixture, "persist-credentials: false");
  assertIncludes(fixture, "deno-version: 2.7.13");
  assertIncludes(fixture, "small-frontend-bug) ;;");
  assertIncludes(fixture, '*) echo "fixture_not_allowlisted" >&2; exit 1 ;;');
  assertIncludes(
    fixture,
    "deno test --cached-only --no-lock --allow-read supabase/tests/testing-center-agent-workflow-contract.test.ts",
  );
  for (
    const forbidden of [
      claudeActionPin,
      "CLAUDE_CODE_OAUTH_TOKEN",
      "ANTHROPIC_API_KEY",
      "app-id:",
      "private-key:",
      "github-app",
      "contents: write",
      "pull-requests:",
      "git push",
      "gh pr",
      "merge:",
      "release:",
      "curl ",
      "wget ",
    ]
  ) assertNotIncludes(fixture, forbidden);
});

Deno.test("repository dispatch fails closed and provider jobs have an inert dependency chain", async () => {
  const workflow = normalize(await Deno.readTextFile(workflowPath));
  const disabled = jobBlock(workflow, "production_disabled");
  assertIncludes(disabled, "if: github.event_name == 'repository_dispatch'");
  assertIncludes(disabled, "run: exit 1");
  assertNotIncludes(disabled, claudeActionPin);

  const topology: Array<[string, string | null]> = [
    ["red_agent", null],
    ["red_gate", "red_agent"],
    ["green_agent", "red_gate"],
    ["green_gate", "green_agent"],
    ["draft_pr", "green_gate"],
  ];
  let previousOffset = -1;
  for (const [jobName, dependency] of topology) {
    const block = jobBlock(workflow, jobName);
    assertIncludes(
      block,
      "if: github.event_name == 'repository_dispatch' && false",
    );
    if (dependency) assertIncludes(block, `needs: ${dependency}`);
    const offset = workflow.indexOf(`  ${jobName}:`);
    assert(offset > previousOffset, `Job is out of order: ${jobName}`);
    previousOffset = offset;
  }
});

Deno.test("RED and GREEN are separate pinned least-privilege Claude sessions", async () => {
  const workflow = normalize(await Deno.readTextFile(workflowPath));
  const red = jobBlock(workflow, "red_agent");
  const green = jobBlock(workflow, "green_agent");

  assertEquals(usesLines(red), [
    `uses: ${checkoutPin}`,
    `uses: ${claudeActionPin}`,
  ], "RED actions");
  assertEquals(usesLines(green), [
    `uses: ${checkoutPin}`,
    `uses: ${claudeActionPin}`,
  ], "GREEN actions");

  for (
    const [phase, block, promptPath] of [
      ["RED", red, redPromptPath],
      ["GREEN", green, greenPromptPath],
    ]
  ) {
    assertIncludes(block, "persist-credentials: false");
    assertIncludes(
      block,
      "claude_code_oauth_token: ${{ secrets.TESTING_CENTER_CLAUDE_CODE_OAUTH_TOKEN }}",
    );
    assertIncludes(block, "github_token: ${{ github.token }}");
    assertIncludes(block, `settings: ${settingsPath}`);
    assertIncludes(block, 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"');
    assertIncludes(block, promptPath);
    assertIncludes(block, "--model claude-sonnet-5");
    assertIncludes(block, "--effort high");
    assertIncludes(block, "--max-turns 20");
    assertIncludes(block, "--strict-mcp-config");
    assertIncludes(block, "--allowedTools Read,Grep,Glob,Edit,Write");
    assertNotIncludes(block, "Bash");
    assertNotIncludes(block, "mcp__");
    assertNotIncludes(block, "secrets.CLAUDE_CODE_OAUTH_TOKEN");
    for (
      const scrubbed of [
        'ANTHROPIC_API_KEY: ""',
        'ANTHROPIC_AUTH_TOKEN: ""',
        'ANTHROPIC_BASE_URL: ""',
        'CLAUDE_CODE_USE_BEDROCK: ""',
        'CLAUDE_CODE_USE_VERTEX: ""',
      ]
    ) assertIncludes(block, scrubbed);
    assert(
      block !== (phase === "RED" ? green : red),
      `${phase} must be separate`,
    );
  }

  assertEquals(
    workflow.split(claudeActionPin).length - 1,
    2,
    "exactly two Claude sessions",
  );
});

Deno.test("gates never invoke Claude and draft_pr can only fail closed", async () => {
  const workflow = normalize(await Deno.readTextFile(workflowPath));
  for (const gateName of ["red_gate", "green_gate"]) {
    const gate = jobBlock(workflow, gateName);
    assertNotIncludes(gate, claudeActionPin);
    assertNotIncludes(gate, "CLAUDE_CODE_OAUTH_TOKEN");
  }

  const draft = jobBlock(workflow, "draft_pr");
  assertNotIncludes(draft, "uses:");
  assertEquals(
    draft.split("\n").map((line) => line.trim()).filter((line) =>
      line.startsWith("run:")
    ),
    ["run: exit 1"],
    "draft_pr commands",
  );
});

Deno.test("settings deny shell web and delegation while allowing only file tools", async () => {
  const settingsText = await Deno.readTextFile(settingsPath);
  const settings = JSON.parse(settingsText) as {
    permissions: { allow: string[]; deny: string[] };
    mcpServers?: unknown;
  };

  assertEquals(settings.permissions.allow, [
    "Read",
    "Grep",
    "Glob",
    "Edit",
    "Write",
  ], "allowed tools");
  assertEquals(settings.permissions.deny, [
    "Bash",
    "WebFetch",
    "WebSearch",
    "Task",
  ], "denied tools");
  assert(
    !Object.hasOwn(settings, "mcpServers"),
    "settings must not define mcpServers",
  );
});

Deno.test("phase prompts treat the dossier as untrusted and preserve RED GREEN isolation", async () => {
  const red = normalize(await Deno.readTextFile(redPromptPath));
  const green = normalize(await Deno.readTextFile(greenPromptPath));

  for (const prompt of [red, green]) {
    for (
      const required of [
        "dossier no confiable",
        "fail-closed",
        "Git",
        "red",
        "MCP",
        "shell",
      ]
    ) assertIncludes(prompt, required);
  }

  for (
    const required of [
      "Solo puedes editar tests allowlisted",
      "No edites producto, configuración ni snapshots",
      "No intentes arreglar el producto",
    ]
  ) assertIncludes(red, required);

  for (
    const required of [
      "sesión nueva",
      "tests están congelados",
      "Solo puedes editar producto allowlisted",
      "fix mínimo",
      "No edites configuración ni snapshots",
    ]
  ) assertIncludes(green, required);
});
