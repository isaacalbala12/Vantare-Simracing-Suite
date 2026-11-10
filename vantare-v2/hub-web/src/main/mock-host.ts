import hello from "../../fixtures/ajustes-base.json";

export { hello };
export function mockReply(message: unknown): unknown {
  if (typeof message !== "object" || message === null || !("kind" in message))
    return null;
  if (message.kind === "hello" && "version" in message && message.version === 1)
    return hello;
  return null;
}
