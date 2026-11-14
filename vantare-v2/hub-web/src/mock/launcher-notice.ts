import type { ResidentView } from "../contract/generated/contract";
import type { MockContext } from "./context";

/** Local QA only: transport acceptance precedes resident receipt and completion. */
export function createLauncherNoticeMock(
  context: MockContext,
  view: ResidentView,
  schedule: (callback: () => void, delay: number) => unknown,
) {
  if (!context.sceneName.startsWith("launcher-notice-")) return;
  const doc = context.launcherData;
  if (!doc) throw new Error("QA notice requires a launcher document");
  context.core.accountGeneration = "a".repeat(64);
  context.core.services = "connected";
  const generation = context.core.accountGeneration;
  view.ownership = { kind: "unsupported" };
  view.execution = {
    instance: "b".repeat(64),
    revisionCheckedLaunch: true,
    checkedAnswer: true,
    checkedControl: true,
    active: null,
    question: null,
    results: { kind: "unknown" },
    firstRetainedSeq: "1",
    events: [],
  };
  const publish = () =>
    context.emit?.({
      kind: "event",
      event: { topic: "launcherResident", value: structuredClone(view) },
    });
  let serial = 0;
  context.launchForNotice = (profile) => {
    const run = String(++serial);
    schedule(() => {
      const execution = view.execution;
      if (!execution) return;
      const rejected = context.sceneName.endsWith("rejected");
      const seq = BigInt(execution.events.at(-1)?.seq ?? "0") + 1n;
      execution.events.push({
        seq: String(seq),
        kind: {
          kind: "received",
          request: serial.toString(16).padStart(32, "0"),
          receipt: rejected
            ? { kind: "rejected", reason: "denied" }
            : { kind: "accepted", run },
        },
      });
      view.running = !rejected;
      execution.active = rejected
        ? null
        : { run, revision: doc.revision, accountGeneration: generation };
      publish();
      if (rejected) {
        doc.running = false;
        doc.profiles.forEach((item) => {
          item.launchable = true;
        });
        context.emit?.({
          kind: "event",
          event: { topic: "launcher", value: structuredClone(doc) },
        });
      }
      if (rejected || context.sceneName.endsWith("accepted")) return;
      schedule(() => {
        if (context.sceneName.endsWith("gap")) {
          execution.events = [];
          execution.firstRetainedSeq = String(seq + 2n);
        }
        execution.events.push({
          seq: String(seq + (context.sceneName.endsWith("gap") ? 2n : 1n)),
          kind: { kind: "finished", run, outcome: { kind: "completed" } },
        });
        execution.active = null;
        execution.results = {
          kind: "known",
          value: {
            run,
            profile,
            revision: doc.revision,
            accountGeneration: generation,
            mode: "profile",
            outcome: { kind: "completed" },
            retryFailed: false,
            steps: (
              doc.profiles.find((item) => item.id === profile)?.apps ?? []
            ).map((_, index) => ({ index, state: "ready" })),
          },
        };
        view.running = false;
        doc.running = false;
        doc.profiles.forEach((item) => {
          item.launchable = true;
        });
        publish();
        context.emit?.({
          kind: "event",
          event: { topic: "launcher", value: structuredClone(doc) },
        });
      }, 1000);
    }, 0);
  };
}
