import { expect, it } from "vitest";
import {
  strategyExportLimit,
  strategyMethods,
} from "../src/contract/generated/strategy";
import { isError, isReply, isRequest } from "../src/contract/modules/strategy";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { isRendererMessage } from "../src/main/security";
import { requests } from "./strategy-corpus";

const revision = "a".repeat(64);
const proposal = { kind: "proposal", computeId: 7 };
const accepted = { kind: "accepted" };

it("takes the two export requests with a closed target and nothing else", () => {
  expect(strategyMethods).toContain("strategy.export");
  expect(strategyMethods).toContain("strategy.exportFile");
  for (const method of ["strategy.export", "strategy.exportFile"]) {
    for (const target of [proposal, accepted])
      expect(isRequest({ method, revision, target }), method).toBe(true);
    // the corpus carries both targets for both methods
    expect(
      requests.filter((request) => request.method === method).length,
      method,
    ).toBeGreaterThanOrEqual(2);
    for (const bad of [
      { method, revision },
      { method, revision, target: { kind: "proposal" } },
      { method, revision, target: { kind: "proposal", computeId: 0 } },
      { method, revision, target: { kind: "proposal", computeId: -1 } },
      { method, revision, target: { kind: "proposal", computeId: 1.5 } },
      { method, revision, target: { kind: "accepted", computeId: 7 } },
      { method, revision, target: { kind: "file", name: "plan.csv" } },
      { method, revision, target: { ...proposal, path: "C:\\x.csv" } },
      { method, revision, target: accepted, path: "C:\\x.csv" },
      { method, revision, target: accepted, name: "plan.csv" },
      { method, revision: "z", target: accepted },
      { method, target: accepted },
    ])
      expect(isRequest(bad), JSON.stringify(bad)).toBe(false);
  }
});

it("takes the answers of an export: the text, the ticket, the file name and the cancellation", () => {
  const response = (result: unknown) => ({ kind: "response", id: 1, result });
  const good = [
    { method: "strategy.export", value: { text: "PROPUESTA SIN ACEPTAR\nx" } },
    {
      method: "strategy.exportFile",
      value: { kind: "ticket", suggestedName: "Fuji - Base.csv" },
    },
    {
      method: "strategy.exportFile",
      value: { kind: "saved", file: { name: "Fuji - Base.csv" } },
    },
    { method: "strategy.exportFile", value: { kind: "cancelled" } },
  ];
  for (const result of good) {
    expect(isReply(result), JSON.stringify(result)).toBe(true);
    expect(isHostMessage(response(result))).toBe(true);
  }
  const bad = [
    { method: "strategy.export", value: { text: 1 } },
    { method: "strategy.export", value: { text: "a", path: "C:\\x" } },
    { method: "strategy.export", value: { text: "a\u0007b" } },
    { method: "strategy.export", value: { text: "a\tb" } },
    {
      method: "strategy.export",
      value: { text: "é".repeat(strategyExportLimit) },
    },
    { method: "strategy.export", value: "texto" },
    // a path, a folder or a stream is never a name
    ...["C:\\x\\plan.csv", "a/b.csv", "plan.csv:flujo", "", ".", ".."].flatMap(
      (name) => [
        {
          method: "strategy.exportFile",
          value: { kind: "saved", file: { name } },
        },
        {
          method: "strategy.exportFile",
          value: { kind: "ticket", suggestedName: name },
        },
      ],
    ),
    {
      method: "strategy.exportFile",
      value: { kind: "saved", file: { name: "a.csv", path: "C:\\a.csv" } },
    },
    { method: "strategy.exportFile", value: { kind: "saved", file: null } },
    { method: "strategy.exportFile", value: { kind: "cancelled", file: null } },
    { method: "strategy.exportFile", value: { kind: "done" } },
    { method: "strategy.exportFile", value: { name: "a.csv" } },
    { method: "strategy.pickFile", value: { kind: "cancelled" } },
  ];
  for (const result of bad)
    expect(isReply(result), JSON.stringify(result)).toBe(false);
  // the text of the biggest plan fits the limit the host keeps
  expect(
    isReply({
      method: "strategy.export",
      value: { text: "a".repeat(strategyExportLimit) },
    }),
  ).toBe(true);
});

it("takes the new typed errors, and no free text with them", () => {
  for (const kind of [
    "strategyNothingToExport",
    "strategyExportNotCsv",
    "strategyFileInUse",
  ]) {
    expect(isError({ kind }), kind).toBe(true);
    expect(isError({ kind, message: "x" }), kind).toBe(false);
    expect(isError({ kind, path: "C:\\x.csv" }), kind).toBe(false);
  }
});

it("lets the renderer ask for an export with its own id and never with an internal one", () => {
  for (const method of ["strategy.export", "strategy.exportFile"]) {
    const request = (id: number) => ({
      kind: "request",
      id,
      request: { method, revision, target: accepted },
    });
    expect(isUiMessage(request(1))).toBe(true);
    expect(isRendererMessage(request(1))).toBe(true);
    // the ids of main are the host's tickets: the renderer cannot take one
    expect(isRendererMessage(request(0x80000000))).toBe(false);
  }
});
