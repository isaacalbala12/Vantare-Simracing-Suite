const workflowPath = ".github/workflows/testing-center-agent-fix.yml";
const redPromptPath = ".github/agents/testing-center-red-prompt.md";
const greenPromptPath = ".github/agents/testing-center-green-prompt.md";
const settingsPath = ".github/agents/testing-center-agent-settings.json";
const reviewPromptPath = ".github/agents/testing-center-review-prompt.md";
const reviewSchemaPath =
  ".github/agents/testing-center-review-output.schema.json";
const reviewSettingsPath = ".github/agents/testing-center-review-settings.json";
const branchGatesPath = ".github/workflows/branch-channel-gates.yml";

const checkoutPin = "actions/checkout@11d5960a326750d5838078e36cf38b85af677262";
const setupDenoPin =
  "denoland/setup-deno@667a34cdef165d8d2b2e98dde39547c9daac7282";
const claudeActionPin =
  "anthropics/claude-code-action@dfb8fc798e1a98ff989c587a166b75010bfe2639";
const uploadArtifactPin =
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02";
const downloadArtifactPin =
  "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093";

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
      "pull-requests: write",
      "issues: write",
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
    "deno test --cached-only --no-lock --allow-read=.github/workflows,.github/agents,supabase/tests/testing-center-agent-workflow-contract.test.ts supabase/tests/testing-center-agent-workflow-contract.test.ts",
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
  assertNotIncludes(fixture, "--allow-read ");
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
    ["manifest_collector", "green_gate"],
    ["diff_gate", "manifest_collector"],
    ["review_opus", "diff_gate"],
    ["review_gate", "review_opus"],
    ["draft_pr", "review_gate"],
  ];
  let previousOffset = -1;
  for (const [jobName, dependency] of topology) {
    const block = jobBlock(workflow, jobName);
    assertIncludes(
      block,
      "if: github.event_name == 'repository_dispatch'",
    );
    assertIncludes(block, "&& false");
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
    assertIncludes(block, "display_report: false");
    assertIncludes(block, "track_progress: false");
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
    usesLines(red).filter((line) => line.includes(claudeActionPin)).length,
    1,
    "one RED Claude session",
  );
  assertEquals(
    usesLines(green).filter((line) => line.includes(claudeActionPin)).length,
    1,
    "one GREEN Claude session",
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

Deno.test("diff and independent Opus review form an inert read-only chain", async () => {
  const workflow = normalize(await Deno.readTextFile(workflowPath));
  const collector = jobBlock(workflow, "manifest_collector");
  const diff = jobBlock(workflow, "diff_gate");
  const review = jobBlock(workflow, "review_opus");
  const gate = jobBlock(workflow, "review_gate");
  const draft = jobBlock(workflow, "draft_pr");

  // C1: MANIFEST_PATH and every download live under RUNNER_TEMP, never workspace.
  assertIncludes(collector, "needs: green_gate");
  assertIncludes(
    collector,
    "MANIFEST_PATH: ${{ runner.temp }}/testing-center/trusted-manifest.json",
  );
  assertIncludes(
    diff,
    "MANIFEST_PATH: ${{ runner.temp }}/testing-center/trusted-manifest.json",
  );
  assertNotIncludes(diff, ".testing-center/validated-diff-manifest.json");

  // C3: the collector only reads verify runner evidence and explicit control ref.
  assertIncludes(collector, "ref: ${{ github.sha }}");
  assertNotIncludes(collector, "client_payload.control_ref");
  assertIncludes(collector, "persist-credentials: false");
  assertIncludes(collector, "uses: " + downloadArtifactPin);
  assertIncludes(collector, "name: testing-center-verify-evidence");
  assertIncludes(collector, "${{ runner.temp }}/testing-center-evidence/");
  assertIncludes(
    collector,
    "COMMAND_RESULTS: ${{ runner.temp }}/testing-center-evidence/command-results.json",
  );
  assertIncludes(
    collector,
    "python .github/scripts/testing_center_manifest_collector.py build",
  );
  assertNotIncludes(collector, "client_payload.command_results");
  assertNotIncludes(collector, "tarball");
  assertNotIncludes(collector, claudeActionPin);

  // Trusted artifacts are short-lived and never staged in the workspace.
  assertIncludes(collector, "uses: " + uploadArtifactPin);
  assertIncludes(collector, "name: testing-center-trusted-manifest");
  assertIncludes(collector, "name: testing-center-trusted-control");
  assertIncludes(collector, "retention-days: 1");

  // C2: diff_gate requires collector success and recomputes sha256 before the gate.
  assertIncludes(diff, "needs: manifest_collector");
  assertIncludes(
    diff,
    "if: github.event_name == 'repository_dispatch' && needs.manifest_collector.result == 'success' && false",
  );
  assertIncludes(diff, "uses: " + downloadArtifactPin);
  assertIncludes(diff, "name: testing-center-trusted-manifest");
  assertIncludes(diff, "uses: " + checkoutPin);
  assertIncludes(diff, "ref: ${{ github.sha }}");
  assertIncludes(diff, "persist-credentials: false");
  assertIncludes(
    diff,
    "EXPECTED_MANIFEST_SHA256: ${{ needs.manifest_collector.outputs.manifest_sha256 }}",
  );
  assertIncludes(diff, "manifest_sha256_mismatch");
  assertIncludes(
    diff,
    'python .github/scripts/testing_center_diff_gate.py "$MANIFEST_PATH"',
  );
  assertIncludes(diff, "uses: " + uploadArtifactPin);
  assertIncludes(diff, "name: testing-center-validated-diff");
  assertIncludes(
    diff,
    'mkdir -p "$RUNNER_TEMP/testing-center-review-input"',
  );
  assertIncludes(
    diff,
    'cp "$MANIFEST_PATH" "$RUNNER_TEMP/testing-center-review-input/validated-diff-manifest.json"',
  );
  assertIncludes(
    diff,
    'cp "$RUNNER_TEMP/diff-decision.json" "$RUNNER_TEMP/testing-center-review-input/diff-decision.json"',
  );
  assertIncludes(diff, "${{ runner.temp }}/testing-center-review-input/");
  assertNotIncludes(diff, "path: |\n      .testing-center/");
  assertNotIncludes(diff, "${{ runner.temp }}/diff-decision.json");
  assertIncludes(diff, "head_sha: ${{ steps.diff_outputs.outputs.head_sha }}");
  assertIncludes(
    diff,
    "head_digest: ${{ steps.diff_outputs.outputs.head_digest }}",
  );
  assertNotIncludes(diff, claudeActionPin);

  assertIncludes(review, "needs: diff_gate");
  assertIncludes(review, "contents: read");
  assertIncludes(review, "pull-requests: read");
  assertIncludes(review, "persist-credentials: false");
  assertIncludes(review, "ref: ${{ needs.diff_gate.outputs.head_sha }}");
  assertIncludes(review, "uses: " + downloadArtifactPin);
  assertIncludes(review, "name: testing-center-validated-diff");
  // P1-1: prompt/schema/settings come from the trusted control artifact only.
  assertIncludes(review, "name: testing-center-trusted-control");
  assertIncludes(review, "${{ runner.temp }}/testing-center-control/");
  assertIncludes(
    review,
    "REVIEW_PROMPT_PATH: ${{ runner.temp }}/testing-center-control/testing-center-review-prompt.md",
  );
  assertIncludes(
    review,
    "REVIEW_SETTINGS_PATH: ${{ runner.temp }}/testing-center-control/testing-center-review-settings.json",
  );
  assertIncludes(
    review,
    "settings: ${{ runner.temp }}/testing-center-control/testing-center-review-settings.json",
  );
  assertIncludes(review, "uses: " + claudeActionPin);
  assertIncludes(review, "id: opus_review");
  assertIncludes(review, 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"');
  assertIncludes(
    review,
    "claude_code_oauth_token: ${{ secrets.TESTING_CENTER_CLAUDE_CODE_OAUTH_TOKEN }}",
  );
  assertIncludes(
    review,
    "VALIDATED_HEAD_SHA: ${{ needs.diff_gate.outputs.head_sha }}",
  );
  assertIncludes(
    review,
    "VALIDATED_HEAD_DIGEST: ${{ needs.diff_gate.outputs.head_digest }}",
  );
  assertIncludes(review, "--model claude-opus-5");
  assertIncludes(review, "--effort high");
  assertIncludes(review, "--max-turns 15");
  assertIncludes(review, "--allowedTools Read,Grep,Glob");
  assertIncludes(review, '--json-schema "$REVIEW_SCHEMA_JSON"');
  assertIncludes(
    review,
    "REVIEW_SCHEMA_JSON: ${{ steps.review_schema.outputs.json }}",
  );
  assertNotIncludes(
    review,
    "--json-schema '${{ steps.review_schema.outputs.json }}'",
  );
  assertNotIncludes(review, ".github/agents/testing-center-review-prompt.md");
  assertNotIncludes(
    review,
    ".github/agents/testing-center-review-output.schema.json",
  );
  assertNotIncludes(
    review,
    "settings: .github/agents/testing-center-review-settings.json",
  );
  assertIncludes(review, "uses: " + uploadArtifactPin);
  assertIncludes(review, "retention-days: 7");
  assertIncludes(review, "GITHUB_STEP_SUMMARY");
  assertIncludes(review, "P0={counts['P0']}");
  for (
    const forbidden of [
      "Edit",
      "Bash",
      "mcp__",
      "session_id",
      "display_report: true",
      "show_full_output: true",
      "track_progress: true",
    ]
  ) assertNotIncludes(review, forbidden);
  assertNotIncludes(review, "--allowedTools Read,Grep,Glob,Edit");
  assertNotIncludes(review, "--allowedTools Read,Grep,Glob,Write");

  assertIncludes(gate, "needs: review_opus");
  assertIncludes(
    gate,
    "REVIEW_JSON: ${{ needs.review_opus.outputs.structured_output }}",
  );
  assertIncludes(
    gate,
    "EXPECTED_HEAD_SHA: ${{ needs.review_opus.outputs.expected_head_sha }}",
  );
  assertIncludes(
    gate,
    "EXPECTED_HEAD_DIGEST: ${{ needs.review_opus.outputs.expected_head_digest }}",
  );
  assertIncludes(gate, "set(review) == {");
  assertIncludes(gate, 'set(findings) == {"P0", "P1", "P2", "P3"}');
  assertNotIncludes(gate, "print(");
  assertNotIncludes(gate, "echo $REVIEW_JSON");
  assertIncludes(draft, "needs: review_gate");
});

Deno.test("Opus review schema is closed bounded and fail-closed", async () => {
  const schema = JSON.parse(await Deno.readTextFile(reviewSchemaPath));
  assertEquals(schema.$id, "testing-center-review/v1", "schema id");
  assertEquals(schema.additionalProperties, false, "closed root");
  assertEquals(
    schema.properties.contractVersion.const,
    "testing-center-review/v1",
    "contract version",
  );
  assertEquals(schema.properties.verdict.enum, [
    "approve",
    "reject",
    "needs_owner",
  ], "verdicts");
  assertEquals(schema.properties.criteria.maxItems, 20, "criteria bound");
  for (const severity of ["P0", "P1", "P2", "P3"]) {
    assertEquals(
      schema.properties.findings.properties[severity].maxItems,
      20,
      severity + " bound",
    );
    assertEquals(
      schema.properties.findings.properties[severity].items.maxLength,
      500,
      severity + " item bound",
    );
  }
});

Deno.test("review prompt is independent read-only and treats evidence as data", async () => {
  const prompt = normalize(await Deno.readTextFile(reviewPromptPath));
  for (
    const required of [
      "no confiables",
      "solo lectura",
      "scope",
      "calidad de tests",
      "correctness",
      "security",
      "schema",
      "Git",
      "red",
      "MCP",
      "shell",
      "comentarios",
      "reviews",
      "status",
      "VALIDATED_HEAD_SHA",
      "VALIDATED_HEAD_DIGEST",
    ]
  ) assertIncludes(prompt, required);
});

Deno.test("review deny-list is explicit and security tests run on every PR", async () => {
  const settings = JSON.parse(await Deno.readTextFile(reviewSettingsPath));
  assertEquals(
    settings.permissions.allow,
    ["Read", "Grep", "Glob"],
    "review allow",
  );
  assertEquals(
    settings.permissions.deny,
    ["Bash", "WebFetch", "WebSearch", "Task", "Edit", "Write"],
    "review deny",
  );

  const gates = normalize(await Deno.readTextFile(branchGatesPath));
  assertIncludes(
    gates,
    "pull_request:\n    branches: [nightly, testers, master]",
  );
  assertIncludes(
    gates,
    "python .github/scripts/test_testing_center_diff_gate.py",
  );
  assertIncludes(
    gates,
    "deno test --no-lock --allow-read=.github/workflows,.github/agents,supabase/tests/testing-center-agent-workflow-contract.test.ts supabase/tests/testing-center-agent-workflow-contract.test.ts",
  );
});
