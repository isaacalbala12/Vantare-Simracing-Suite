import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  STRATEGY_CONTRACT_MANIFEST_V1,
  StrategyContractError,
  addFuel,
  addVirtualEnergy,
  asFuelLiters,
  asLapCount,
  asVirtualEnergyPercent,
  canonicalizeAndHashStrategyJSONV1,
  decodePlanRevisionV1,
  decodeReplanProposalV1,
  decodeStrategyExecutionStateV1,
  parsePlanRevisionV1,
  verifyPlanRevisionHash,
  type FuelLiters,
  type PlanRevisionV1,
  type UnverifiedPlanRevisionV1,
  type VirtualEnergyPercent,
} from "./strategy-contract-v1";

const contractFixturePath = path.resolve(
  process.cwd(),
  "../internal/strategy/contract/testdata/contract_manifest_v1.json",
);
const revisionFixturePath = path.resolve(
  process.cwd(),
  "../internal/strategy/contract/testdata/plan_revision_v1.golden.json",
);
const canonicalFixturePath = path.resolve(
  process.cwd(),
  "../internal/strategy/contract/testdata/canonicalization_v1.json",
);
const validationFixturePath = path.resolve(
  process.cwd(),
  "../internal/strategy/contract/testdata/validation_v1.json",
);
const executionStateFixturePath = path.resolve(
  process.cwd(),
  "../internal/strategy/contract/testdata/execution_state_v1.json",
);
const documentValidationFixturePath = path.resolve(
  process.cwd(),
  "../internal/strategy/contract/testdata/document_validation_v1.json",
);

interface DocumentValidationOperation {
  readonly kind: "set" | "delete" | "duplicate";
  readonly path: readonly string[];
  readonly value?: unknown;
}

interface DocumentValidationCase {
  readonly name: string;
  readonly operations: readonly DocumentValidationOperation[];
  readonly accepted: boolean;
  readonly errorCode?: string;
  readonly errorField?: string;
}

interface DocumentValidationCorpus {
  readonly validReplan: unknown;
  readonly planRevisionCases: readonly DocumentValidationCase[];
  readonly replanProposalCases: readonly DocumentValidationCase[];
}

const expectedPlanRevisionValidationNames = [
  "valid plan revision",
  "revision root null",
  "revision root scalar",
  "revision missing contract version",
  "revision scalar contract version",
  "revision unsupported contract version",
  "revision missing identifier",
  "revision scalar identifier",
  "revision unknown top level field",
  "revision duplicate top level key",
  "revision null provenance",
  "revision unknown provenance field",
  "revision scalar mode",
  "revision base from another plan",
  "revision unknown base field",
  "revision tampered payload",
] as const;

const expectedReplanProposalValidationNames = [
  "valid proposed replan",
  "replan root null",
  "replan root scalar",
  "replan missing contract version",
  "replan unsupported contract version",
  "replan scalar proposal identifier",
  "replan unknown top level field",
  "replan duplicate top level key",
  "replan scalar base",
  "replan unknown base field",
  "replan candidate from another plan",
  "replan candidate equals base",
  "replan scalar status",
  "accepted replan missing decision",
  "proposed replan with decision",
  "replan expiry not after creation",
  "replan decision predates creation",
  "accepted replan expired before decision",
  "replan non canonical creation timestamp",
  "replan unknown confidence field",
] as const;

describe("strategy contract v1", () => {
  it("matches the Go-owned contract manifest exactly", () => {
    const goManifest = JSON.parse(
      readFileSync(contractFixturePath, "utf8"),
    ) as unknown;

    expect(STRATEGY_CONTRACT_MANIFEST_V1).toEqual(goManifest);
  });

  it("keeps fuel and Virtual Energy as incompatible branded quantities", () => {
    const fuel = asFuelLiters(42.5);
    const reserve = asFuelLiters(3.25);
    const energy = asVirtualEnergyPercent(71.5);
    const margin = asVirtualEnergyPercent(4.5);

    expect(addFuel(fuel, reserve)).toBe(45.75);
    expect(addVirtualEnergy(energy, margin)).toBe(76);
    expectTypeOf(fuel).toEqualTypeOf<FuelLiters>();
    expectTypeOf(energy).toEqualTypeOf<VirtualEnergyPercent>();
    expectTypeOf(addFuel).parameter(1).toEqualTypeOf<FuelLiters>();
    expectTypeOf(addFuel).parameter(1).not.toEqualTypeOf<VirtualEnergyPercent>();
    expectTypeOf(addVirtualEnergy)
      .parameter(1)
      .not.toEqualTypeOf<FuelLiters>();
  });

  it("rejects invalid unit values with a stable typed error", () => {
    expect(() => asFuelLiters(-1)).toThrowError(StrategyContractError);
    expect(() => asVirtualEnergyPercent(100.1)).toThrowError(
      expect.objectContaining({ code: "invalid_unit" }),
    );
  });

  it("uses the shared JavaScript-safe integer domain for lap counts", () => {
    expect(asLapCount(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => asLapCount(Number.MAX_SAFE_INTEGER + 1)).toThrowError(
      expect.objectContaining({ code: "invalid_unit", field: "lapCount" }),
    );
  });

  it("decodes and verifies the exact Go golden revision", async () => {
    const document = readFileSync(revisionFixturePath, "utf8");
    const revision = await decodePlanRevisionV1(document);

    expectTypeOf(revision).toEqualTypeOf<PlanRevisionV1<unknown>>();
    expect(revision.contractVersion).toBe("strategy.v1");
    expect(revision.revisionId).toBe("revision-golden-001");
    await expect(verifyPlanRevisionHash(revision)).resolves.toBe(true);
  });

  it("rejects a changed Go revision instead of trusting its hash", async () => {
    const document = JSON.parse(
      readFileSync(revisionFixturePath, "utf8"),
    ) as Record<string, unknown>;
    const revision = parsePlanRevisionV1({
      ...document,
      name: "Tampered name",
    });

    expectTypeOf(revision).toEqualTypeOf<UnverifiedPlanRevisionV1<unknown>>();
    await expect(verifyPlanRevisionHash(revision)).resolves.toBe(false);
    await expect(
      decodePlanRevisionV1(JSON.stringify({ ...document, name: "Tampered name" })),
    ).rejects.toMatchObject({
      code: "revision_hash_mismatch",
      field: "contentHash",
    });
  });

  it("rejects a base revision from another plan before hash verification", () => {
    const document = JSON.parse(
      readFileSync(revisionFixturePath, "utf8"),
    ) as Record<string, unknown>;
    expect(() =>
      parsePlanRevisionV1({
        ...document,
        baseRevision: {
          planId: "another-plan",
          variantId: document.variantId,
          revisionId: "revision-base",
          contentHash: "a".repeat(64),
        },
      }),
    ).toThrow(StrategyContractError);
  });

  it("matches canonical bytes and hashes for the shared adversarial corpus", async () => {
    const corpus = JSON.parse(readFileSync(canonicalFixturePath, "utf8")) as {
      algorithm: string;
      cases: Array<{
        name: string;
        inputJson: string;
        accepted: boolean;
        expectedCanonicalHex: string;
        expectedSha256: string;
      }>;
    };
    expect(corpus.algorithm).toBe("sha256:strategy-c14n-v1");
    for (const test of corpus.cases) {
      if (!test.accepted) {
        await expect(
          canonicalizeAndHashStrategyJSONV1(test.inputJson),
          test.name,
        ).rejects.toBeInstanceOf(StrategyContractError);
        continue;
      }
      const result = await canonicalizeAndHashStrategyJSONV1(test.inputJson);
      expect(result.canonicalHex, test.name).toBe(test.expectedCanonicalHex);
      expect(result.sha256, test.name).toBe(test.expectedSha256);
    }
  });

  it("enforces the same canonicalization resource limits in TypeScript", async () => {
    const tooDeep = "[".repeat(65) + "0" + "]".repeat(65);
    await expect(canonicalizeAndHashStrategyJSONV1(tooDeep)).rejects.toBeInstanceOf(
      StrategyContractError,
    );
    const tooLarge = " ".repeat((4 << 20) + 1);
    await expect(canonicalizeAndHashStrategyJSONV1(tooLarge)).rejects.toBeInstanceOf(
      StrategyContractError,
    );

	const stringAboveContainerLimit = JSON.stringify({
	  text: "a".repeat(
		STRATEGY_CONTRACT_MANIFEST_V1.canonicalLimits.maxContainerItems + 1,
	  ),
	});
	await expect(
	  canonicalizeAndHashStrategyJSONV1(stringAboveContainerLimit),
	).resolves.toEqual(expect.objectContaining({ sha256: expect.any(String) }));
  });

  it("encodes many small fragments within a bounded contiguous output", async () => {
    const itemCount = 65_536;
    const document = JSON.stringify(Array.from({ length: itemCount }, () => null));
    const result = await canonicalizeAndHashStrategyJSONV1(document);

    expect(result.canonicalHex.length / 2).toBe(5 + itemCount);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes one million canonical numbers without a per-byte hex fragment array", async () => {
    const itemCount = 1_000_000;
    const document = `[${"0,".repeat(itemCount - 1)}0]`;

    const result = await canonicalizeAndHashStrategyJSONV1(document);

    // 5-byte array header plus one 9-byte float64 value per item: ~9 MiB.
    expect(result.canonicalHex).toHaveLength(2 * (5 + 9 * itemCount));
    expect(result.sha256).toBe(
      "714778b4b5abb1029272f3edc0c955052517653fd1bcfb1d67441af544e7389a",
    );
  });

  it("bounds direct hash verification independently from the JSON parser", async () => {
    const document = JSON.parse(
      readFileSync(revisionFixturePath, "utf8"),
    ) as Record<string, unknown>;
    let payload: unknown = 0;
    for (
      let depth = 0;
      depth <= STRATEGY_CONTRACT_MANIFEST_V1.canonicalLimits.maxDepth;
      depth += 1
    ) {
      payload = [payload];
    }
    const revision = parsePlanRevisionV1({ ...document, payload });

    await expect(verifyPlanRevisionHash(revision)).rejects.toMatchObject({
      code: "invalid_document",
      field: "",
    });
  });

  it("matches shared lowercase hash and canonical timestamp validation", () => {
    const validation = JSON.parse(
      readFileSync(validationFixturePath, "utf8"),
    ) as {
      hashes: Array<{ name: string; value: string; accepted: boolean }>;
      timestamps: Array<{ name: string; value: string; accepted: boolean }>;
    };
    const golden = JSON.parse(
      readFileSync(revisionFixturePath, "utf8"),
    ) as Record<string, unknown>;

    for (const test of validation.hashes) {
      const parse = () => parsePlanRevisionV1({ ...golden, contentHash: test.value });
      if (test.accepted) {
        expect(parse, test.name).not.toThrow();
      } else {
        expect(parse, test.name).toThrow(StrategyContractError);
      }
    }
    for (const test of validation.timestamps) {
      const parse = () => parsePlanRevisionV1({ ...golden, createdAt: test.value });
      if (test.accepted) {
        expect(parse, test.name).not.toThrow();
      } else {
        expect(parse, test.name).toThrow(StrategyContractError);
      }
    }
  });

  it("strictly decodes replans and rejects duplicate or inconsistent input", () => {
    const base = {
      planId: "plan",
      variantId: "variant",
      revisionId: "rev-1",
      contentHash: "a".repeat(64),
    };
    const candidate = {
      planId: "plan",
      variantId: "variant",
      revisionId: "rev-2",
      contentHash: "b".repeat(64),
    };
    const valid = JSON.stringify({
      contractVersion: "strategy.v1",
      proposalId: "proposal-1",
      base,
      candidate,
      status: "proposed",
      reasonCode: "fuel_changed",
      provenance: { kind: "derived", sourceId: "strategy-engine" },
      confidence: { level: "high", basis: "five valid laps" },
      createdAt: "2026-08-01T18:00:00Z",
    });
    expect(decodeReplanProposalV1(valid).proposalId).toBe("proposal-1");
    const fractionalLifecycle = JSON.stringify({
      ...JSON.parse(valid),
      status: "accepted",
      createdAt: "2026-08-01T18:00:00.1Z",
      decidedAt: "2026-08-01T18:00:00.11Z",
      expiresAt: "2026-08-01T18:00:00.12Z",
    });
    expect(decodeReplanProposalV1(fractionalLifecycle).status).toBe("accepted");
    expect(() =>
      decodeReplanProposalV1(valid.replace('"proposalId"', '"proposalId":"first","proposalId"')),
    ).toThrow(StrategyContractError);
    expect(() =>
      decodeReplanProposalV1(
        JSON.stringify({
          ...JSON.parse(valid),
          candidate: { ...candidate, planId: "other" },
        }),
      ),
    ).toThrow(StrategyContractError);
  });

  it("rejects duplicate keys before decoding a plan revision", async () => {
    const golden = readFileSync(revisionFixturePath, "utf8");
    const duplicate = golden.replace(
      '"revisionId"',
      '"revisionId":"duplicate","revisionId"',
    );
    await expect(decodePlanRevisionV1(duplicate)).rejects.toBeInstanceOf(
      StrategyContractError,
    );
  });

  it("matches Go error code and field for revision and replan documents", async () => {
    const corpus = JSON.parse(
      readFileSync(documentValidationFixturePath, "utf8"),
    ) as DocumentValidationCorpus;
    const revisionBase = JSON.parse(
      readFileSync(revisionFixturePath, "utf8"),
    ) as unknown;

    expect(corpus.planRevisionCases.map((test) => test.name)).toEqual(
      expectedPlanRevisionValidationNames,
    );
    expect(corpus.replanProposalCases.map((test) => test.name)).toEqual(
      expectedReplanProposalValidationNames,
    );

    for (const test of corpus.planRevisionCases) {
      const document = applyDocumentOperations(revisionBase, test.operations);
      try {
        const revision = await decodePlanRevisionV1(document);
        expect(test.accepted, test.name).toBe(true);
        expect(revision.revisionId, test.name).toBe("revision-golden-001");
      } catch (error) {
        assertValidationError(test, error);
      }
    }

    for (const test of corpus.replanProposalCases) {
      const document = applyDocumentOperations(corpus.validReplan, test.operations);
      try {
        const proposal = decodeReplanProposalV1(document);
        expect(test.accepted, test.name).toBe(true);
        expect(proposal.proposalId, test.name).toBe("proposal-1");
      } catch (error) {
        assertValidationError(test, error);
      }
    }
  });

  it("strictly decodes execution state using the shared accept/reject corpus", () => {
    const corpus = JSON.parse(readFileSync(executionStateFixturePath, "utf8")) as {
      cases: Array<{
        name: string;
        document: string;
        accepted: boolean;
        errorCode?: string;
        errorField?: string;
      }>;
    };
    const expectedCaseNames = [
	  "root must be an object",
	  "missing contract version",
	  "valid minimum counters",
	  "valid maximum safe counters",
	  "unknown top level field",
	  "unknown nested active plan field",
	  "missing nested revision",
	  "duplicate top level key",
	  "duplicate nested key",
	  "trailing data",
	  "non canonical active timestamp",
	  "non canonical updated timestamp",
	  "unknown capability",
	  "duplicate capabilities",
	  "zero epoch",
	  "zero sequence",
	  "fractional epoch",
	  "unknown execution status",
	  "unsorted capabilities",
	  "unknown provenance kind",
	  "known provenance without source",
	  "known confidence without basis",
	  "non canonical provenance timestamp",
	  "epoch above shared safe range",
	  "sequence above shared safe range",
	];
	 expect(corpus.cases.map((test) => test.name)).toEqual(expectedCaseNames);

    for (const test of corpus.cases) {
      if (test.accepted) {
        expect(decodeStrategyExecutionStateV1(test.document).executionId, test.name).toBe(
          "execution-1",
        );
        continue;
      }
      try {
        decodeStrategyExecutionStateV1(test.document);
        throw new Error(`expected rejection for ${test.name}`);
      } catch (error) {
        expect(error, test.name).toBeInstanceOf(StrategyContractError);
        expect(error, test.name).toMatchObject({
          code: test.errorCode,
          field: test.errorField,
        });
      }
    }
  });

  it("keeps nested execution error paths stable", () => {
	const corpus = JSON.parse(readFileSync(executionStateFixturePath, "utf8")) as {
	  cases: Array<{ document: string; accepted: boolean }>;
	};
	const validDocument = JSON.parse(corpus.cases[2].document) as Record<
	  string,
	  unknown
	>;
	const cases: Array<{
	  name: string;
	  mutate: (document: Record<string, unknown>) => void;
	  code: string;
	  field: string;
	}> = [
	  {
		name: "invalid nested revision identifier",
		mutate: (document) => {
		  const active = document.activePlan as Record<string, unknown>;
		  (active.revision as Record<string, unknown>).planId = "";
		},
		code: "invalid_identifier",
		field: "activePlan.revision.planId",
	  },
	  {
		name: "missing nested revision identifier",
		mutate: (document) => {
		  const active = document.activePlan as Record<string, unknown>;
		  delete (active.revision as Record<string, unknown>).planId;
		},
		code: "invalid_document",
		field: "activePlan.revision.planId",
	  },
	  {
		name: "unknown nested revision field",
		mutate: (document) => {
		  const active = document.activePlan as Record<string, unknown>;
		  (active.revision as Record<string, unknown>).unexpected = true;
		},
		code: "invalid_document",
		field: "activePlan.revision.unexpected",
	  },
	  {
		name: "unknown provenance field",
		mutate: (document) => {
		  (document.provenance as Record<string, unknown>).unexpected = true;
		},
		code: "invalid_document",
		field: "provenance.unexpected",
	  },
	  {
		name: "missing provenance kind",
		mutate: (document) => {
		  delete (document.provenance as Record<string, unknown>).kind;
		},
		code: "invalid_document",
		field: "provenance.kind",
	  },
	  {
		name: "unknown confidence field",
		mutate: (document) => {
		  (document.confidence as Record<string, unknown>).unexpected = true;
		},
		code: "invalid_document",
		field: "confidence.unexpected",
	  },
	  {
		name: "missing confidence level",
		mutate: (document) => {
		  delete (document.confidence as Record<string, unknown>).level;
		},
		code: "invalid_document",
		field: "confidence.level",
	  },
	  {
		name: "scalar activation identifier",
		mutate: (document) => {
		  (document.activePlan as Record<string, unknown>).activationId = 7;
		},
		code: "invalid_identifier",
		field: "activePlan.activationId",
	  },
	  {
		name: "scalar revision hash",
		mutate: (document) => {
		  const active = document.activePlan as Record<string, unknown>;
		  (active.revision as Record<string, unknown>).contentHash = 7;
		},
		code: "invalid_document",
		field: "activePlan.revision.contentHash",
	  },
	  {
		name: "scalar execution status",
		mutate: (document) => { document.status = 7; },
		code: "invalid_state",
		field: "status",
	  },
	  {
		name: "scalar capabilities",
		mutate: (document) => { document.capabilities = "fuel_strategy"; },
		code: "invalid_document",
		field: "capabilities",
	  },
	  {
		name: "scalar provenance kind",
		mutate: (document) => {
		  (document.provenance as Record<string, unknown>).kind = 7;
		},
		code: "invalid_provenance",
		field: "provenance.kind",
	  },
	  {
		name: "scalar confidence level",
		mutate: (document) => {
		  (document.confidence as Record<string, unknown>).level = 7;
		},
		code: "invalid_confidence",
		field: "confidence.level",
	  },
	  {
		name: "scalar updated timestamp",
		mutate: (document) => { document.updatedAt = 7; },
		code: "invalid_document",
		field: "updatedAt",
	  },
	];

	for (const test of cases) {
	  const document = structuredClone(validDocument) as Record<string, unknown>;
	  test.mutate(document);
	  expect(() => decodeStrategyExecutionStateV1(JSON.stringify(document)), test.name)
		.toThrowError(expect.objectContaining({ code: test.code, field: test.field }));
	}
  });
});

function applyDocumentOperations(
  base: unknown,
  operations: readonly DocumentValidationOperation[],
): string {
  let document = structuredClone(base) as unknown;
  for (const operation of operations) {
    if (operation.kind === "duplicate") {
      if (operation.path.length !== 1) {
        throw new Error("duplicate operations only support top-level fields");
      }
      const encoded = JSON.stringify(document);
      const field = operation.path[0];
      const needle = `"${field}":`;
      return encoded.replace(
        needle,
        `${needle}${JSON.stringify(operation.value)},${needle}`,
      );
    }
    if (operation.path.length === 0) {
      if (operation.kind !== "set") {
        throw new Error(`unsupported root operation ${operation.kind}`);
      }
      document = structuredClone(operation.value);
      continue;
    }
    let current = document as Record<string, unknown>;
    for (const part of operation.path.slice(0, -1)) {
      current = current[part] as Record<string, unknown>;
    }
    const field = operation.path.at(-1) as string;
    if (operation.kind === "delete") {
      delete current[field];
    } else {
      current[field] = structuredClone(operation.value);
    }
  }
  return JSON.stringify(document);
}

function assertValidationError(
  test: DocumentValidationCase,
  error: unknown,
): void {
  expect(test.accepted, test.name).toBe(false);
  expect(error, test.name).toBeInstanceOf(StrategyContractError);
  expect(error, test.name).toMatchObject({
    code: test.errorCode,
    field: test.errorField,
  });
}
