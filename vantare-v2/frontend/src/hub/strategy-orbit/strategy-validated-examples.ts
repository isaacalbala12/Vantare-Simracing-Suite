import type {
  StrategyApplicationClient,
  StrategyValidatedExamplesV1,
} from "../../strategy/strategy-application-client";

let validatedExamplesSequence = 0;

export async function loadValidatedExamples(
  client: StrategyApplicationClient<unknown>,
  repositoryVersion: number,
  eventId: string,
): Promise<StrategyValidatedExamplesV1> {
  validatedExamplesSequence += 1;
  const result = await client.execute({
    protocolVersion: "strategy.application.v1",
    commandId: `orbit-validated-examples-${Date.now()}-${validatedExamplesSequence}`,
    operation: "get_validated_examples",
    expectedRepositoryVersion: repositoryVersion,
    eventId,
  });
  if (!result.validatedExamples) throw new Error("Strategy validated examples result is missing");
  return result.validatedExamples;
}
