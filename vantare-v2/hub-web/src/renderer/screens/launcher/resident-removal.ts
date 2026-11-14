import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  ResidentRemoveTarget,
  ResidentView,
} from "../../../contract/generated/contract";
import { coreKey, offline, useHost } from "../../app/Host";
import { useLauncherRequest } from "../../app/LauncherRequest";
import { HostFailure } from "../../bridge/client";
import type { AnswerClock } from "./resident-answer";
import { answerCursor } from "./resident-answer-model";
import {
  observeRemoval,
  queueRemoval,
  type RemovalAttempt,
  type RemovalReason,
  sameRemoval,
} from "./resident-removal-model";
import { launcherKey, useLauncherSnapshot } from "./state";

const clock: AnswerClock = {
  now: () => performance.now(),
  schedule: (callback, delay) => {
    const id = setTimeout(callback, delay);
    return () => clearTimeout(id);
  },
};
export function useResidentRemoval(
  resident: ResidentView | undefined,
  time: AnswerClock = clock,
) {
  const { client, issue } = useHost();
  const query = useQueryClient();
  const launch = useLauncherRequest();
  const { view: document } = useLauncherSnapshot();
  const { data: core = offline } = useQuery({
    queryKey: coreKey,
    queryFn: async () => offline,
    enabled: false,
  });
  const [attempt, setAttempt] = useState<RemovalAttempt>();
  const latest = useRef<RemovalAttempt | undefined>(undefined),
    posting = useRef(false),
    epoch = useRef(0);
  const publish = useCallback((value: RemovalAttempt | undefined) => {
    latest.current = value;
    setAttempt(value);
  }, []);
  const current = useRef({ client, issue, resident, document, core, launch });
  useLayoutEffect(() => {
    current.current = { client, issue, resident, document, core, launch };
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: invalidate responses across transport and session boundaries.
  useLayoutEffect(() => {
    epoch.current++;
    posting.current = false;
    const previous = latest.current;
    if (
      previous &&
      ["sending", "queued", "accepted"].includes(previous.phase.kind)
    )
      publish({ ...previous, phase: { kind: "unknown" } });
    return () => {
      epoch.current++;
      posting.current = false;
    };
  }, [
    client,
    issue,
    core.accountGeneration,
    core.services,
    resident?.execution?.instance,
    publish,
  ]);
  useEffect(() => {
    const previous = latest.current;
    if (!previous || !["queued", "accepted"].includes(previous.phase.kind))
      return;
    publish(
      issue ||
        core.services !== "connected" ||
        core.accountGeneration !== previous.target.accountGeneration
        ? { ...previous, phase: { kind: "unknown" } }
        : observeRemoval(previous, resident, time.now()),
    );
  }, [resident, issue, core.services, core.accountGeneration, time, publish]);
  useEffect(() => {
    if (attempt?.phase.kind !== "queued" && attempt?.phase.kind !== "accepted")
      return;
    return time.schedule(
      () => {
        const previous = latest.current;
        if (previous)
          publish(
            observeRemoval(previous, current.current.resident, time.now()),
          );
      },
      Math.max(0, attempt.phase.until - time.now()),
    );
  }, [attempt, time, publish]);
  function reason(
    target: ResidentRemoveTarget | undefined,
    live = current.current,
  ): RemovalReason | undefined {
    const own = live.resident?.ownership;
    if (own?.kind === "unsupported") return "unsupported";
    if (
      !live.client ||
      live.issue ||
      live.core.services !== "connected" ||
      !live.resident?.online ||
      live.resident.protected ||
      !live.resident.execution
    )
      return "unavailable";
    if (own?.kind !== "known") return "ownership-unknown";
    if (!target) return "ownership-unknown";
    if (
      target.instance !== live.resident.execution.instance ||
      own.instance !== target.instance
    )
      return "wrong-instance";
    if (
      target.accountGeneration !== live.core.accountGeneration ||
      own.accountGeneration !== target.accountGeneration
    )
      return "account-changed";
    if (
      !live.core.access.verified ||
      live.core.access.blocked ||
      live.core.live
    )
      return "denied";
    if (!live.document || live.document.protected)
      return "document-unavailable";
    if (
      target.revision !== live.document.revision ||
      own.revision !== target.revision
    )
      return "revision-mismatch";
    const profile = own.profiles.find(
      (item) => item.profile === target.profile,
    );
    if (
      !profile ||
      !live.document.profiles.some((item) => item.id === target.profile)
    )
      return "document-unavailable";
    if (profile.ownedLive) return "owned-live";
    if (
      posting.current ||
      live.document.running ||
      live.document.scanning ||
      live.resident.running ||
      live.resident.execution.active ||
      live.launch.busy()
    )
      return "busy";
    const previous = latest.current;
    if (
      previous &&
      (["sending", "queued", "accepted"].includes(previous.phase.kind) ||
        (previous.phase.kind === "unknown" &&
          sameRemoval(previous.target, target)))
    )
      return "busy";
  }
  function target(profile: string): ResidentRemoveTarget | undefined {
    const own = resident?.ownership;
    return own?.kind === "known"
      ? {
          instance: own.instance,
          accountGeneration: own.accountGeneration,
          revision: own.revision,
          profile,
        }
      : undefined;
  }
  async function remove(target: ResidentRemoveTarget) {
    if (reason(target)) return;
    const { client, resident } = current.current;
    if (!client || !resident) return;
    posting.current = true;
    const token = epoch.current;
    const next: RemovalAttempt = {
      target: { ...target },
      cursor: answerCursor(resident),
      phase: { kind: "sending" },
    };
    publish(next);
    try {
      const reply = await client.request({
        method: "launcher.profile.removeChecked",
        target: next.target,
      });
      if (token !== epoch.current) return;
      publish(
        reply.method === "launcher.profile.removeChecked"
          ? observeRemoval(
              queueRemoval(next, reply.value.request, time.now()),
              current.current.resident,
              time.now(),
            )
          : { ...next, phase: { kind: "unknown" } },
      );
    } catch (error) {
      if (token !== epoch.current) return;
      const detail = error instanceof HostFailure ? error.detail : undefined;
      if (detail?.kind === "launcherConflict")
        query.setQueryData(launcherKey, detail.current);
      publish({
        ...next,
        phase:
          detail?.kind === "launcherConflict"
            ? { kind: "rejected", reason: "write-conflict" }
            : detail?.kind === "residentRemovalRejected"
              ? { kind: "rejected", reason: detail.reason }
              : detail &&
                  ["busy", "denied", "unsupported", "rejected"].includes(
                    detail.kind,
                  )
                ? {
                    kind: "rejected",
                    reason: detail.kind as
                      | "busy"
                      | "denied"
                      | "unsupported"
                      | "rejected",
                  }
                : { kind: "unknown" },
      });
    } finally {
      if (token === epoch.current) posting.current = false;
    }
  }
  return {
    attempt,
    target,
    remove,
    reason: (target: ResidentRemoveTarget | undefined) =>
      reason(target, { client, issue, resident, document, core, launch }),
    dismiss: () => {
      if (
        !posting.current &&
        (!latest.current ||
          !["sending", "queued", "accepted", "unknown"].includes(
            latest.current.phase.kind,
          ))
      )
        publish(undefined);
    },
  };
}
export type ResidentRemovalController = ReturnType<typeof useResidentRemoval>;
