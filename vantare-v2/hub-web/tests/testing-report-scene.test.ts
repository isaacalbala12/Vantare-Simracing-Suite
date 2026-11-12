import { expect, it } from "vitest";
import { isHostMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

it("gives only the dedicated report reference a connected service and a real draft reply", () => {
  for (const scene of [
    "testing-tester-report-reference",
    "visual-light:testing-tester-report-reference",
  ]) {
    const host = createMockHost(scene);
    const core = host({
      kind: "request",
      id: 1,
      request: { method: "core.get" },
    });
    expect(isHostMessage(core)).toBe(true);
    expect(core).toMatchObject({
      result: {
        value: {
          services: "connected",
          access: { verified: true, tester: true, calendar: true },
        },
      },
    });
    const draft = host({
      kind: "request",
      id: 2,
      request: { method: "draft.load" },
    });
    expect(isHostMessage(draft)).toBe(true);
    expect(draft).toMatchObject({
      result: {
        method: "draft.load",
        value: { exists: false, screenshots: [] },
      },
    });
  }
  const other = createMockHost("visual-light:testing-tester-reference");
  expect(
    other({ kind: "request", id: 1, request: { method: "core.get" } }),
  ).toMatchObject({ result: { value: { services: "unavailable" } } });
  expect(
    other({ kind: "request", id: 2, request: { method: "draft.load" } }),
  ).toMatchObject({ kind: "failure", error: { kind: "coreUnavailable" } });
});

it("projects only the real service fields into previews and keeps tester notes in the local draft", () => {
  const host = createMockHost("testing-tester-report-reference");
  const fields = {
    module: "hub",
    actionText: "Título privado",
    expectedText: "Esperado privado",
    observedText: "Texto privado",
    contextText: "Tipo: Sugerencia\nContexto privado",
  };
  host({ kind: "request", id: 1, request: { method: "draft.save", fields } });
  for (const method of ["report.prepare", "report.retryPrepare"] as const) {
    const preview = host({ kind: "request", id: 2, request: { method } });
    expect(isHostMessage(preview)).toBe(true);
    expect(preview).toMatchObject({
      result: {
        method,
        value: {
          fields: {
            module: "hub",
            actionText: "Informe estructurado",
            expectedText: "Revisión humana pendiente",
            observedText: "Revisión humana pendiente",
            contextText: "",
          },
        },
      },
    });
    expect(JSON.stringify(preview)).not.toContain("privado");
  }
  const draft = host({
    kind: "request",
    id: 3,
    request: { method: "draft.load" },
  });
  expect(isHostMessage(draft)).toBe(true);
  expect(draft).toMatchObject({ result: { value: { fields } } });
});
