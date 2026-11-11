import { describe, expect, it } from "vitest";
import fixture from "../fixtures/launcher-editor.json";
import type { ProfileEditorView } from "../src/contract/generated/contract";
import {
  isDirty,
  snapshot,
} from "../src/renderer/screens/launcher/editor-state";
import { mergeDraft } from "../src/renderer/screens/launcher/merge-draft";

function read(): ProfileEditorView {
  const value = structuredClone(fixture) as ProfileEditorView;
  value.draft.id = "creator";
  value.draft.steps = [
    {
      key: "a".repeat(64),
      appId: "lmu",
      delaySeconds: 0,
      hasCustomArguments: true,
    },
    {
      key: "b".repeat(64),
      appId: "lmu",
      delaySeconds: 2,
      hasCustomArguments: true,
    },
  ];
  return value;
}
describe("profile conflict merge", () => {
  it("replays only edited fields and individual policy fields while retaining fresh steps", () => {
    const original = read();
    const current = snapshot(original);
    current.draft.name = "Mi nombre";
    current.draft.policy.retries = 3;
    const fresh = read();
    fresh.revision = "1".repeat(64);
    fresh.draft.favorite = !original.draft.favorite;
    fresh.draft.hotkey = "ctrl+shift+9";
    fresh.draft.startup = !original.draft.startup;
    fresh.draft.notes = "Notas ajenas";
    fresh.draft.policy.exit = "closeStarted";
    fresh.draft.policy.failure = "continue";
    fresh.draft.steps[0].key = "c".repeat(64);
    fresh.draft.steps[0].delaySeconds = 17;
    const merged = mergeDraft(current, fresh);
    expect(merged.draft).toEqual({
      ...fresh.draft,
      name: "Mi nombre",
      policy: { ...fresh.draft.policy, retries: 3 },
    });
    expect(merged.argumentLossFromRevision).toBe(false);
  });
  it("has nothing to save when the user changed nothing or a fresh field already has that value", () => {
    const current = snapshot(read());
    const fresh = read();
    fresh.revision = "1".repeat(64);
    fresh.draft.name = "Cambio ajeno";
    expect(isDirty(mergeDraft(current, fresh))).toBe(false);
    current.draft.name = fresh.draft.name;
    expect(isDirty(mergeDraft(current, fresh))).toBe(false);
  });
  it("renews moved step identities only within the same revision", () => {
    const current = snapshot(read());
    current.draft.steps.reverse();
    current.stepKeys.reverse();
    const fresh = read();
    fresh.draft.steps[0].key = "c".repeat(64);
    fresh.draft.steps[1].key = "d".repeat(64);
    expect(
      mergeDraft(current, fresh).draft.steps.map((step) => step.key),
    ).toEqual(["d".repeat(64), "c".repeat(64)]);
    fresh.revision = "1".repeat(64);
    const merged = mergeDraft(current, fresh);
    expect(merged.draft.steps.map((step) => step.key)).toEqual([null, null]);
    expect(merged.argumentLossFromRevision).toBe(true);
  });
});
