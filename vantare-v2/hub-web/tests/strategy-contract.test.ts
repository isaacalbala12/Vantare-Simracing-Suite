import { expect, it } from "vitest";
import { isError, isReply, isRequest } from "../src/contract/modules/strategy";
import { createMockHost } from "../src/mock/host";

const choose = {
  method: "strategy.select",
  eventId: "event-1",
  strategyId: "variant-2",
  revision: "a".repeat(64),
};

it("keeps the mock winner and requires an explicit retry with its revision", () => {
  const host = createMockHost("strategy-ready");
  let id = 0;
  const send = (request: unknown) =>
    host({ kind: "request", id: ++id, request });
  const opened = send({ method: "strategy.open" });
  if (opened?.kind !== "response" || opened.result.method !== "strategy.open")
    throw Error("Strategy open");
  const winner = send({ ...choose, revision: opened.result.value.revision });
  if (winner?.kind !== "response" || winner.result.method !== "strategy.select")
    throw Error("Strategy select");
  expect(winner.result.value.activeStrategyId).toBe("variant-2");
  expect(isReply(winner.result)).toBe(true);
  const stale = send({ ...choose, strategyId: "variant-1", revision: opened.result.value.revision });
  expect(stale).toMatchObject({
    kind: "failure",
    error: { kind: "strategyConflict", current: winner.result.value },
  });
  if (stale?.kind !== "failure") throw Error("Strategy conflict");
  expect(isError(stale.error)).toBe(true);
  expect(send({ ...choose, strategyId: "variant-1", revision: winner.result.value.revision }))
    .toMatchObject({ kind: "response", result: { value: { activeStrategyId: "variant-1" } } });
});
it.each(["ready","empty","recovered","protected","importedLegacy"])("mock projects %s", (state) => {
  expect(createMockHost("strategy-"+state)({kind:"request",id:1,request:{method:"strategy.open"}}))
    .toMatchObject({kind:"response", result:{value:{state,dirty:false}}});
});
it("rejects paths, invalid revisions and unknown fields", () => {
  expect(isRequest(choose)).toBe(true);
  for(const fields of [{eventId:"../event-1"},{strategyId:"C:\\a"},{revision:"0"},{path:"private"},{settings:{}}])
    expect(isRequest({...choose,...fields})).toBe(false);
  expect(createMockHost("strategy-denied")({kind:"request",id:1,request:{method:"strategy.open"}}))
    .toMatchObject({kind:"failure",error:{kind:"denied"}});
});
