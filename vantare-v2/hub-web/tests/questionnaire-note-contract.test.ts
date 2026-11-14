import { expect, it } from "vitest";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

const questionnaire = {
  id: "15350000-0000-0000-0000-000000000001",
  version: "QA",
  title: "Cuestionario",
  question: "¿Cómo fue?",
  score: 4,
};
function reply(extra: Record<string, unknown>) {
  return {
    kind: "response",
    id: 1,
    result: {
      method: "testing.refresh",
      value: { reports: [], questionnaires: [{ ...questionnaire, ...extra }] },
    },
  };
}
it("accepts the previous comment verbatim and the legacy absence", () => {
  for (const extra of [{}, { note: "" }, { note: "Comentario anterior\nñ" }]) {
    expect(isHostMessage(reply(extra))).toBe(true);
  }
});
it("rejects non-text comments and unknown questionnaire fields", () => {
  for (const extra of [
    { note: null },
    { note: 4 },
    { note: {} },
    { note: "QA", other: "not allowed" },
  ]) {
    expect(isHostMessage(reply(extra))).toBe(false);
  }
});
it("keeps legacy answers compatible and validates optional explicit notes", () => {
  const request = (extra: Record<string, unknown>) => ({
    kind: "request",
    id: 1,
    request: { method: "testing.answer", id: questionnaire.id, score: 4, ...extra },
  });
  for (const extra of [{}, { note: "" }, { note: "Nueva\nñ" }]) {
    expect(isUiMessage(request(extra))).toBe(true);
  }
  for (const note of [null, 4, "a".repeat(1001), "bad\0note"]) {
    expect(isUiMessage(request({ note }))).toBe(false);
  }
  const host = createMockHost("testing-tester-reports");
  const answer = (extra: Record<string, unknown>) => host(request(extra));
  expect(answer({ note: "Nueva" })).toMatchObject({
    result: { value: { questionnaires: [{ note: "Nueva", score: 4 }] } },
  });
  expect(answer({})).toMatchObject({
    result: { value: { questionnaires: [{ note: "Nueva", score: 4 }] } },
  });
  expect(answer({ note: "" })).toMatchObject({
    result: { value: { questionnaires: [{ note: "", score: 4 }] } },
  });
});
