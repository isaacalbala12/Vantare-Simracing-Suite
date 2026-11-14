import type {
  HostToUi,
  ResidentRemovalRejection,
  ResidentRemoveTarget,
  ResidentView,
} from "../contract/generated/contract";
import type { MockContext, MockHandler } from "./context";
export function createResidentRemovalMock(
  context: MockContext,
  view: ResidentView,
  schedule: (callback: () => void, delay: number) => unknown,
): MockHandler {
  const scene = context.sceneName,
    doc = context.launcherData;
  if (!doc || !scene.startsWith("launcher-")) return () => undefined;
  if (
    scene === "launcher-base" ||
    scene === "launcher-ready" ||
    scene.startsWith("launcher-removal-") ||
    scene === "launcher-borrar-perfil"
  ) {
    context.core.services = "connected";
    context.core.accountGeneration = "a".repeat(64);
    context.core.access.verified = true;
    view.execution ??= {
      instance: "b".repeat(64),
      revisionCheckedLaunch: true,
      checkedAnswer: false,
      checkedControl: false,
      results: { kind: "unsupported" },
      active: null,
      question: null,
      firstRetainedSeq: "1",
      events: [],
    };
  }
  let queued = false,
    removing = false,
    serial = 0;
  function ownership() {
    if (scene === "launcher-removal-unsupported")
      view.ownership = { kind: "unsupported" };
    else if (
      scene === "launcher-removal-unknown" ||
      !view.execution ||
      !view.online ||
      view.protected ||
      context.core.services !== "connected" ||
      !context.core.accountGeneration ||
      doc?.protected
    )
      view.ownership = { kind: "unknown" };
    else
      view.ownership = {
        kind: "known",
        instance: view.execution.instance,
        accountGeneration: context.core.accountGeneration,
        revision: doc?.revision ?? "0".repeat(64),
        profiles:
          doc?.profiles.map((profile) => ({
            profile: profile.id,
            ownedLive: scene === "launcher-removal-owned",
          })) ?? [],
      };
  }
  ownership();
  const publish = () => {
    context.emit?.({
      kind: "event",
      event: { topic: "launcherResident", value: structuredClone(view) },
    });
  };
  function invalid(
    target: ResidentRemoveTarget,
  ): ResidentRemovalRejection | "protected" | undefined {
    // Same observable priority as ownership.rs::remove_with_clock.
    if (!view.online) return "authority-unavailable";
    if (target.instance !== view.execution?.instance) return "wrong-instance";
    if (context.core.services !== "connected") return "authority-unavailable";
    if (target.accountGeneration !== context.core.accountGeneration)
      return "account-changed";
    if (
      !context.core.access.verified ||
      context.core.access.blocked ||
      context.core.live
    )
      return "denied";
    if (queued || view.running || doc?.running) return "busy";
    if (view.ownership.kind !== "known") return "ownership-unknown";
    if (target.revision !== view.ownership.revision) return "revision-mismatch";
    const profile = view.ownership.profiles.find(
      (item) => item.profile === target.profile,
    );
    if (!profile) return "document-unavailable";
    if (profile.ownedLive) return "owned-live";
    if (
      !doc?.exists ||
      doc.protected ||
      view.protected ||
      !context.removeLauncherProfile
    )
      return "protected";
    if (target.revision !== doc.revision) return "write-conflict";
    if (!doc.profiles.some((profile) => profile.id === target.profile))
      return "document-unavailable";
  }
  return (message) => {
    if (
      (message.kind === "subscribe" && message.topic === "launcherResident") ||
      (message.kind === "request" &&
        message.request.method === "launcher.resident.get")
    ) {
      ownership();
      return undefined;
    }
    if (
      message.kind !== "request" ||
      message.request.method !== "launcher.profile.removeChecked"
    )
      return undefined;
    if (view.ownership.kind === "unsupported")
      return {
        kind: "failure",
        id: message.id,
        error: { kind: "unsupported" },
      };
    const target = { ...message.request.target };
    const reject = (reason: ResidentRemovalRejection): HostToUi => ({
      kind: "failure",
      id: message.id,
      error: { kind: "residentRemovalRejected", reason },
    });
    const reason = invalid(target);
    if (reason === "protected")
      return { kind: "failure", id: message.id, error: { kind: "protected" } };
    if (reason === "write-conflict")
      return {
        kind: "failure",
        id: message.id,
        error: { kind: "launcherConflict", current: structuredClone(doc) },
      };
    if (reason) return reject(reason);
    if (removing) return reject("busy");
    const execution = view.execution;
    if (!execution) return reject("ownership-unknown");
    queued = true;
    const request = (++serial).toString(16).padStart(32, "0");
    const seq = () => String(BigInt(execution.events.at(-1)?.seq ?? "0") + 1n);
    schedule(() => {
      queued = false;
      if (scene === "launcher-removal-timeout") return;
      if (scene === "launcher-removal-restart") {
        execution.instance = "e".repeat(64);
        execution.events = [];
        ownership();
        publish();
        return;
      }
      if (scene === "launcher-removal-gap") {
        execution.firstRetainedSeq = "3";
        execution.events = [
          {
            seq: "3",
            kind: {
              kind: "removal-finished",
              request,
              outcome: { kind: "removed", revision: doc.revision },
            },
          },
        ];
        publish();
        return;
      }
      const conflict = scene === "launcher-removal-conflict" && serial === 1;
      if (conflict) {
        doc.revision = (BigInt(`0x${doc.revision}`) + 1n)
          .toString(16)
          .padStart(64, "0");
        ownership();
        context.emit?.({
          kind: "event",
          event: { topic: "launcher", value: structuredClone(doc) },
        });
      }
      const error = conflict
        ? "write-conflict"
        : (invalid(target) ??
          (scene === "launcher-removal-rejected" ? "owned-live" : undefined));
      const failure = error === "protected" ? "document-unavailable" : error;
      execution.events.push({
        seq: seq(),
        kind: {
          kind: "removal-received",
          request,
          receipt: failure
            ? { kind: "rejected", reason: failure }
            : { kind: "accepted" },
        },
      });
      publish();
      if (failure) return;
      removing = true;
      if (scene === "launcher-removal-accepted") return;
      schedule(() => {
        const error =
          invalid(target) ??
          (scene === "launcher-removal-failed" ? "io" : undefined);
        const failure = error === "protected" ? "document-unavailable" : error;
        if (!failure) context.removeLauncherProfile?.(target.profile);
        removing = false;
        execution.events.push({
          seq: seq(),
          kind: {
            kind: "removal-finished",
            request,
            outcome: failure
              ? { kind: "failed", reason: failure }
              : { kind: "removed", revision: doc.revision },
          },
        });
        ownership();
        context.emit?.({
          kind: "event",
          event: { topic: "launcher", value: structuredClone(doc) },
        });
        publish();
      }, 1000);
    }, 0);
    return {
      kind: "response",
      id: message.id,
      result: {
        method: "launcher.profile.removeChecked",
        value: { kind: "queued", request },
      },
    };
  };
}
