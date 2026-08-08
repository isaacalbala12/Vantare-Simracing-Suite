import { describe, expect, it } from "vitest";
import {
  STRATEGY_APPLICATION_PROTOCOL_V1,
  type StrategyApplicationClient,
  type StrategyApplicationCommandV1,
  type StrategyApplicationResultV1,
  type StrategyImportEntryV1,
  type StrategyImportPreviewV1,
} from "./strategy-application-client";
import {
  commitStrategyImport,
  decodeBase64,
  describeImportEntry,
  encodeBase64,
  exportStrategyPackage,
  previewStrategyImport,
  summariseImport,
} from "./strategy-transfer";

const provenance = {
  application: "vantare",
  applicationVersion: "0.1.0.7",
  exportedAt: "2026-08-08T10:00:00Z",
} as const;

function entry(overrides: Partial<StrategyImportEntryV1> = {}): StrategyImportEntryV1 {
  return {
    planId: "plan-1",
    variantId: "variant-1",
    name: "Plan",
    mode: "manual",
    disposition: "new",
    hasDraft: true,
    revisionCount: 1,
    newRevisions: 1,
    conflictingRevisions: [],
    ...overrides,
  };
}

function preview(overrides: Partial<StrategyImportPreviewV1> = {}): StrategyImportPreviewV1 {
  return {
    packageVersion: "strategy.package.v1",
    contractVersion: "strategy.v1",
    provenance,
    checksum: "abc123",
    entries: [entry()],
    importable: true,
    ...overrides,
  };
}

function clientReturning(
  result: Partial<StrategyApplicationResultV1<unknown>>,
  seen: StrategyApplicationCommandV1<unknown>[] = [],
): StrategyApplicationClient<unknown> {
  return {
    async execute(command) {
      seen.push(command);
      return {
        protocolVersion: STRATEGY_APPLICATION_PROTOCOL_V1,
        commandId: command.commandId,
        repositoryVersion: 4,
        recoveredFromBackup: false,
        closed: false,
        ...result,
      } satisfies StrategyApplicationResultV1<unknown>;
    },
    cancel() { return false; },
    dispose() {},
  };
}

describe("strategy package transfer", () => {
  it("asks the service to export the selected plans and returns the bytes", async () => {
    const seen: StrategyApplicationCommandV1<unknown>[] = [];
    const bytes = new Uint8Array([1, 2, 250, 255]);
    const exported = await exportStrategyPackage(
      clientReturning({ package: encodeBase64(bytes) }, seen),
      "export-1",
      { plans: [{ planId: "plan-1", variantId: "variant-1" }], provenance },
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ operation: "export", commandId: "export-1" });
    expect(Array.from(exported.bytes)).toEqual([1, 2, 250, 255]);
    expect(exported.suggestedFileName).toBe("plan-1-2026-08-08.vantareplan.json");
  });

  it("refuses an empty selection before sending a command", async () => {
    const seen: StrategyApplicationCommandV1<unknown>[] = [];
    await expect(
      exportStrategyPackage(clientReturning({}, seen), "export-1", { plans: [], provenance }),
    ).rejects.toThrow(/al menos un plan/);
    expect(seen).toHaveLength(0);
  });

  it("previews as a dry run and never as a write", async () => {
    const seen: StrategyApplicationCommandV1<unknown>[] = [];
    const result = await previewStrategyImport(
      clientReturning({ preview: preview(), imported: false }, seen),
      "preview-1",
      new Uint8Array([7]),
    );

    expect(seen[0]).toMatchObject({ operation: "import", dryRun: true });
    expect(result.entries).toHaveLength(1);
  });

  it("discards a dry run that claims to have written", async () => {
    await expect(
      previewStrategyImport(
        clientReturning({ preview: preview(), imported: true }),
        "preview-1",
        new Uint8Array([7]),
      ),
    ).rejects.toThrow(/afirma haber escrito/);
  });

  it("commits against the version it was shown", async () => {
    const seen: StrategyApplicationCommandV1<unknown>[] = [];
    const outcome = await commitStrategyImport(
      clientReturning({ preview: preview(), imported: true }, seen),
      "import-1",
      new Uint8Array([7]),
      9,
    );

    expect(seen[0]).toMatchObject({ operation: "import", expectedRepositoryVersion: 9 });
    expect(seen[0]).not.toHaveProperty("dryRun");
    expect(outcome.repositoryVersion).toBe(4);
  });

  it("treats an import that did not write as a failure", async () => {
    await expect(
      commitStrategyImport(
        clientReturning({ preview: preview(), imported: false }),
        "import-1",
        new Uint8Array([7]),
        0,
      ),
    ).rejects.toThrow(/no se completó/);
  });

  it("survives a round trip through base64 for every byte value", () => {
    const all = new Uint8Array(256);
    for (let index = 0; index < 256; index += 1) all[index] = index;
    expect(Array.from(decodeBase64(encodeBase64(all)))).toEqual(Array.from(all));
  });

  it("describes each disposition in words a person can act on", () => {
    expect(describeImportEntry(entry({ disposition: "new", revisionCount: 1 })))
      .toBe("Nuevo · 1 revisión");
    expect(describeImportEntry(entry({ disposition: "unchanged" })))
      .toBe("Ya lo tienes · no cambia nada");
    expect(describeImportEntry(entry({ disposition: "adds_revisions", newRevisions: 3 })))
      .toBe("Añade 3 revisiones");
    expect(describeImportEntry(entry({ disposition: "replaces_draft" })))
      .toBe("Sustituye tus cambios abiertos");
    expect(describeImportEntry(entry({ disposition: "conflict", conflictingRevisions: ["r1", "r2"] })))
      .toBe("Choca con 2 revisiones guardadas");
  });

  it("summarises a preview without hiding what it would overwrite", () => {
    expect(summariseImport(preview())).toBe("1 plan");
    expect(summariseImport(preview({ entries: [entry({ disposition: "unchanged" })] })))
      .toBe("Nada que importar: ya lo tienes todo");
    expect(summariseImport(preview({
      entries: [entry(), entry({ planId: "plan-2", disposition: "replaces_draft" })],
    }))).toBe("2 planes, y 1 sustituye cambios abiertos");
    expect(summariseImport(preview({
      importable: false,
      entries: [entry({ disposition: "conflict", conflictingRevisions: ["r1"] })],
    }))).toBe("1 plan choca con lo que ya tienes guardado");
  });

  it("names a multi-plan export by how many plans it holds", async () => {
    const exported = await exportStrategyPackage(
      clientReturning({ package: encodeBase64(new Uint8Array([1])) }),
      "export-1",
      {
        plans: [
          { planId: "plan-1", variantId: "variant-1" },
          { planId: "plan-2", variantId: "variant-1" },
        ],
        provenance,
      },
    );
    expect(exported.suggestedFileName).toBe("planes-2-2026-08-08.vantareplan.json");
  });
});
