import { vi } from "vitest";
import type { AnalysisRequest } from "../src/contract/generated/analysis";
import type { Reply } from "../src/contract/generated/contract";
import { analysisQaNow } from "../src/mock/analysis-scenes";
import { createMockHost } from "../src/mock/host";
import { HostFailure } from "../src/renderer/bridge/client";

/** Native mock results, with only the delivery of compare replies controlled. */
export function controlledAnalysisHost(invalidateOnCancel = false) {
  let id = 0;
  const native = createMockHost(
    "analysis-qa-compare",
    () => {},
    () => analysisQaNow,
  );
  const answer = (request: AnalysisRequest): Reply => {
    const reply = native({ kind: "request", id: ++id, request });
    if (reply?.kind === "response") return reply.result;
    if (reply?.kind === "failure") throw new HostFailure(reply.error);
    throw Error("Expected a synchronous fixture reply");
  };
  let job:
    | {
        session: string;
        result: Reply;
        resolve: (r: Reply) => void;
        reject: (e: unknown) => void;
      }
    | undefined;
  const outstanding = new Set<Promise<Reply>>();
  const sessions: string[] = [];
  const request = vi.fn((r: AnalysisRequest): Promise<Reply> => {
    let response: Promise<Reply>;
    try {
      if (r.method === "analysis.compare") {
        const result = answer(r);
        response = new Promise((resolve, reject) => {
          job = { session: r.session, result, resolve, reject };
        });
      } else if (r.method === "analysis.cancel") {
        const cancelled = !!job && invalidateOnCancel;
        if (cancelled && job) {
          const old = job;
          job = undefined;
          answer({ method: "analysis.close", session: old.session }); // Host invalidation, not a UI close.
          old.reject(new HostFailure({ kind: "analysisCancelled" }));
        }
        response = Promise.resolve({ method: r.method, cancelled });
      } else {
        const result = answer(r);
        if (result.method === "analysis.open") sessions.push(result.session);
        response = Promise.resolve(result);
      }
    } catch (error) {
      response = Promise.reject(error);
    }
    outstanding.add(response);
    void response.then(
      () => outstanding.delete(response),
      () => outstanding.delete(response),
    );
    return response;
  });
  return {
    request,
    sessions,
    outstanding,
    pending: () => !!job,
    finish() {
      const old = job;
      if (!old) throw Error("No compare awaiting delivery");
      job = undefined;
      old.resolve(old.result);
    },
    fail(kind: "analysisCancelled" | "analysisTimeout") {
      const old = job;
      if (!old) throw Error("No compare awaiting delivery");
      job = undefined;
      answer({ method: "analysis.close", session: old.session });
      old.reject(new HostFailure({ kind }));
    },
    closeExternally(session: string) {
      answer({ method: "analysis.close", session });
    },
    closes: () =>
      request.mock.calls.flatMap(([r]) =>
        r.method === "analysis.close" ? [r.session] : [],
      ),
    cancels: () =>
      request.mock.calls.filter(([r]) => r.method === "analysis.cancel").length,
  };
}
