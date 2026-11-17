import corpus from "../../contract/generated/corpus/workshop.json";
import type { WorkshopReply } from "../../contract/generated/workshop";
import type { MockContext, MockHandler } from "../context";

export const workshopCatalog = corpus.host[0].result as WorkshopReply;
export function create(_context: MockContext): MockHandler {
  return (message) => {
    if (
      message.kind !== "request" ||
      message.request.method !== "workshop.catalog"
    )
      return undefined;
    return {
      kind: "response",
      id: message.id,
      result: structuredClone(workshopCatalog),
    };
  };
}
