import publication from "../../../fixtures/roadmap-publication.json";
import type { HostToUi, UiToHost } from "../../contract/generated/contract";
import type { MockContext, MockHandler } from "../context";
export function create(context: MockContext): MockHandler {
  const { sceneName, core } = context;
  if (sceneName.startsWith("roadmap-")) core.access.verified = true;
  return (value: UiToHost): HostToUi | null | undefined => {
    if (value.kind !== "request") return undefined;
    const { id, request } = value;
    switch (request.method) {
      case "roadmap.cached":
      case "roadmap.refresh": {
        if (sceneName === "roadmap-base") return null;
        if (
          sceneName === "roadmap-error" &&
          request.method === "roadmap.refresh"
        )
          return { kind: "failure", id, error: { kind: "coreUnavailable" } };
        return {
          kind: "response",
          id,
          result: {
            method: request.method,
            value: {
              stale: sceneName === "roadmap-error",
              publication:
                sceneName === "roadmap-base"
                  ? null
                  : {
                      id: publication.id,
                      publishedAt: publication.published_at,
                      items: publication.document.items.map((item) => ({
                        id: item.id,
                        section: item.section,
                        title: item.title.es,
                        body: item.body.es,
                        area: item.area ?? null,
                        version: item.version ?? null,
                        dueDate: item.dueDate ?? null,
                      })),
                    },
            },
          },
        };
      }

      default:
        return undefined;
    }
  };
}
