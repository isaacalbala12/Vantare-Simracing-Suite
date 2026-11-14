import { expect, it } from "vitest";
import type { ResidentOutcome } from "../src/contract/generated/contract";
import { launcherCompletionFeed } from "../src/shared/launcher-completion";
import {
  finished,
  generation,
  instance,
  received,
  residentCompletionView,
} from "./helpers/launcher-completion";

it("emits once only after Finished, never Accepted, idle or a summary alone", () => {
  const feed = launcherCompletionFeed(() => generation);
  expect(feed.observe(residentCompletionView())).toEqual([]);
  expect(feed.observe(residentCompletionView([received]))).toEqual([]);
  const result = feed.observe(residentCompletionView([received, finished]));
  expect(result).toEqual([
    {
      instance,
      accountGeneration: generation,
      run: "1",
      profile: "creator",
      revision: "c".repeat(64),
    },
  ]);
  expect(feed.observe(residentCompletionView([received, finished]))).toEqual(
    [],
  );
});
it("does not replay completed runs from the first snapshot", () => {
  const feed = launcherCompletionFeed(() => generation);
  expect(feed.observe(residentCompletionView([received, finished]))).toEqual(
    [],
  );
  expect(feed.observe(residentCompletionView([received, finished]))).toEqual(
    [],
  );
});
it.each<ResidentOutcome>([
  { kind: "failed", reason: "step-failed" },
  { kind: "cancelled", reason: "user" },
])("does not announce $kind as ready", (outcome) => {
  const feed = launcherCompletionFeed(() => generation);
  feed.observe(residentCompletionView());
  feed.observe(residentCompletionView([received]));
  expect(
    feed.observe(
      residentCompletionView(
        [
          received,
          { ...finished, kind: { kind: "finished", run: "1", outcome } },
        ],
        outcome,
      ),
    ),
  ).toEqual([]);
});
it("a gap stays unconfirmed even if the next snapshot has an active run", () => {
  const feed = launcherCompletionFeed(() => generation);
  feed.observe(residentCompletionView());
  const gap = residentCompletionView([finished]);
  if (!gap.execution) throw Error("execution");
  gap.execution.firstRetainedSeq = "2";
  gap.execution.active = {
    run: "1",
    revision: "c".repeat(64),
    accountGeneration: generation,
  };
  expect(feed.observe(gap)).toEqual([]);
  expect(feed.observe(gap)).toEqual([]);
  const late = residentCompletionView([{ ...finished, seq: "3" }]);
  expect(feed.observe(late)).toEqual([]);
});
it.each([
  "offline",
  "protected",
  "authority-unavailable",
  "instance",
  "account",
])("does not attribute a late result after %s", (change) => {
  let currentGeneration: string | null = generation;
  const feed = launcherCompletionFeed(() => currentGeneration);
  feed.observe(residentCompletionView());
  feed.observe(residentCompletionView([received]));
  const view = residentCompletionView([received, finished]);
  if (!view.execution || view.ownership.kind !== "known") throw Error("scope");
  if (change === "offline") view.online = false;
  if (change === "protected") view.protected = true;
  if (change === "authority-unavailable") currentGeneration = null;
  if (change === "instance") view.execution.instance = "f".repeat(64);
  if (change === "account") currentGeneration = "e".repeat(64);
  expect(feed.observe(view)).toEqual([]);
  expect(feed.observe(residentCompletionView([received, finished]))).toEqual(
    [],
  );
});
it.each(["unknown", "rehearsal", "old-account"])(
  "does not announce a %s summary",
  (change) => {
    const feed = launcherCompletionFeed(() => generation);
    feed.observe(residentCompletionView());
    feed.observe(residentCompletionView([received]));
    const view = residentCompletionView([received, finished]);
    if (view.execution?.results.kind !== "known") throw Error("results");
    if (change === "rehearsal") view.execution.results.value.mode = "rehearsal";
    if (change === "old-account")
      view.execution.results.value.accountGeneration = "e".repeat(64);
    if (change === "unknown") view.execution.results = { kind: "unknown" };
    expect(feed.observe(view)).toEqual([]);
  },
);
