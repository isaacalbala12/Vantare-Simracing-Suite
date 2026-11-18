import corpus from "../src/contract/generated/corpus/strategy.json";

type Message = (typeof corpus.ui)[number];
type Sent = Extract<Message, { request: unknown }>;

/** The renderer requests of the corpus (it also holds the trusted answer of main). */
export const requests = corpus.ui
  .filter((message): message is Sent => "request" in message)
  .map((message) => message.request);

export const requestOf = (method: string) =>
  requests.find((request) => request.method === method);
