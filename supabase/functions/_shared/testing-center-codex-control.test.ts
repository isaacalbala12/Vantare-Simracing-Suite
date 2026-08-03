// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type CodexControlStore,
  type CodexQueueCommand,
  type NightlyAncestryResolver,
  prepareCodexDryRun,
} from "./testing-center-codex-control.ts";
import { buildVerifiedCodexEvidence } from "./testing-center-codex-evidence.ts";
import {
  classifyCodexRisk,
  type CodexRiskInput,
} from "./testing-center-codex-risk.ts";

const issueId = `issue_${"a".repeat(64)}`;
const reportId = `report_${"b".repeat(64)}`;
const baseSha = "1".repeat(40);
const headSha = "2".repeat(40);

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

const sensitive: CodexRiskInput["sensitive"] = {
  security: false,
  privacy: false,
  auth: false,
  permissions: false,
  secrets: false,
  billing_or_licensing: false,
  data_loss_or_corruption: false,
  migration: false,
  workflow_or_release: false,
  dependency_change: false,
  architecture_change: false,
  mass_edit: false,
};

function riskInput(): CodexRiskInput {
  return {
    contractVersion: "testing-center.codex-risk.v1",
    technicalIssueId: issueId,
    reportId,
    completeness: "complete",
    reproduction: "deterministic",
    trustedSurface: "frontend.presentation",
    affectedModuleCount: 1,
    estimatedFileCount: 2,
    existingRegressionHarness: true,
    priorAutomaticAttempts: 0,
    testerRejections: 0,
    sensitive,
    untrustedEvidence: "not authoritative",
  };
}

async function evidenceRow() {
  const diagnosticPayload = JSON.stringify({
    contractVersion: "testing-center.diagnostic.v1",
    generatedAtUtc: "2026-08-02T00:00:00Z",
    application: {
      version: "0.1.0",
      channel: "nightly",
      os: "windows",
      arch: "amd64",
    },
    module: "testing_center",
    errorCode: "ui.button.disabled",
    logs: [],
    sanitization: {
      inputLogs: 0,
      includedLogs: 0,
      omittedLogs: 0,
      redactedValues: 0,
      truncatedMessages: 0,
    },
  });
  const evidence = await buildVerifiedCodexEvidence({
    contractVersion: "testing-center.codex-evidence.v1",
    technicalIssueId: issueId,
    reportId,
    diagnosticPayload,
    diagnosticDigest: await sha256(diagnosticPayload),
    diagnosticByteSize: new TextEncoder().encode(diagnosticPayload).length,
    diagnosticConsent: true,
    logsConsent: false,
  });
  return {
    contract_version: evidence.contractVersion,
    technical_issue_id: evidence.technicalIssueId,
    report_id: evidence.reportId,
    source_diagnostic_digest: evidence.sourceDiagnosticDigest,
    evidence_text: evidence.evidenceText,
    evidence_digest: evidence.evidenceDigest,
  };
}

class Store implements CodexControlStore {
  queued: CodexQueueCommand[] = [];
  constructor(
    private readonly loaded: unknown,
    private readonly receipt: unknown = {
      queue_status: "queued",
      run_id: `codex_run_${"c".repeat(64)}`,
    },
  ) {}
  loadVerifiedEvidence(): Promise<unknown> {
    return Promise.resolve(this.loaded);
  }
  queueDryRun(command: CodexQueueCommand): Promise<unknown> {
    this.queued.push(command);
    return Promise.resolve(this.receipt);
  }
}

class Resolver implements NightlyAncestryResolver {
  constructor(private readonly ancestry: unknown) {}
  loadNightlyAncestry(): Promise<unknown> {
    return Promise.resolve(this.ancestry);
  }
}

function ancestry(overrides: Record<string, unknown> = {}) {
  return {
    nightlyHeadSha: headSha,
    ancestorShas: [headSha, baseSha],
    ...overrides,
  };
}

async function input() {
  const risk = riskInput();
  return {
    contractVersion: "testing-center.codex-dry-run.v1" as const,
    moduleId: "testing_center.presentation" as const,
    analysisBaseSha: baseSha,
    riskInput: risk,
    riskDecision: await classifyCodexRisk(risk),
  };
}

Deno.test("service preparation binds DB evidence exact base proof and durable queue", async () => {
  const store = new Store(await evidenceRow());
  const prepared = await prepareCodexDryRun(
    await input(),
    store,
    new Resolver(ancestry()),
  );
  assertEquals(prepared.queueStatus, "queued");
  assertEquals(prepared.request.repository.analysisBaseSha, baseSha);
  assertEquals(prepared.request.repository.repositoryAccess, "forbidden");
  assertEquals(store.queued.length, 1);
  assertEquals(store.queued[0].requestDigest, prepared.request.requestDigest);
  assertEquals(
    store.queued[0].ancestryProofDigest,
    prepared.ancestryProof.proofDigest,
  );
});

Deno.test("an identical durable queue receipt is accepted without changing request", async () => {
  const store = new Store(await evidenceRow(), {
    queue_status: "existing",
    run_id: `codex_run_${"d".repeat(64)}`,
  });
  const prepared = await prepareCodexDryRun(
    await input(),
    store,
    new Resolver(ancestry()),
  );
  assertEquals(prepared.queueStatus, "existing");
  assertEquals(store.queued.length, 1);
});

Deno.test("missing or cross-issue persisted evidence fails before queue", async () => {
  const valid = await evidenceRow();
  for (
    const loaded of [
      { ...valid, extra: true },
      { ...valid, technical_issue_id: `issue_${"e".repeat(64)}` },
    ]
  ) {
    const store = new Store(loaded);
    const preparation = await input();
    await assertRejects(() =>
      prepareCodexDryRun(
        preparation,
        store,
        new Resolver(ancestry()),
      )
    );
    assertEquals(store.queued.length, 0);
  }
});

Deno.test("missing duplicated or malformed ancestry snapshots fail before queue", async () => {
  const cases = [
    ancestry({ ancestorShas: [headSha] }),
    ancestry({ ancestorShas: [headSha, baseSha, baseSha] }),
    ancestry({ nightlyHeadSha: "4".repeat(40) }),
    ancestry({ extra: true }),
  ];
  for (const proof of cases) {
    const store = new Store(await evidenceRow());
    const preparation = await input();
    await assertRejects(() =>
      prepareCodexDryRun(preparation, store, new Resolver(proof))
    );
    assertEquals(store.queued.length, 0);
  }
});

Deno.test("ambiguous or malformed durable receipts fail closed", async () => {
  for (
    const receipt of [
      { queue_status: "maybe", run_id: `codex_run_${"c".repeat(64)}` },
      { queue_status: "queued", run_id: "run-free-text" },
      {
        queue_status: "queued",
        run_id: `codex_run_${"c".repeat(64)}`,
        extra: true,
      },
    ]
  ) {
    const preparation = await input();
    const loaded = await evidenceRow();
    await assertRejects(() =>
      prepareCodexDryRun(
        preparation,
        new Store(loaded, receipt),
        new Resolver(ancestry()),
      )
    );
  }
});
