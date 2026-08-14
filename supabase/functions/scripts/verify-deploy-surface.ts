const productionFunctions = new Set([
  "billing-checkout",
  "billing-portal",
  "billing-webhook",
  "license-credential",
]);
const testingPilotFunctions = new Set([
  "testing-center-feedback",
  "testing-center-linear-webhook",
  "testing-center-linear-worker",
]);
const testingAutomationFunctions = new Set([
  "testing-center-agent-dispatch",
  "testing-center-agent-callback",
]);
const recognizedFunctions = new Set([
  ...productionFunctions,
  ...testingPilotFunctions,
  ...testingAutomationFunctions,
]);
const infrastructure = new Set(["_deprecated", "_shared", "scripts"]);

export function invalidDeployableDirectories(
  entries: Deno.DirEntry[],
): string[] {
  return entries
    .filter((entry) => entry.isDirectory)
    .map((entry) => entry.name)
    .filter((name) =>
      !infrastructure.has(name) && !recognizedFunctions.has(name)
    )
    .sort();
}

if (import.meta.main) {
  const functionsRoot = new URL("..", import.meta.url);
  const invalid = invalidDeployableDirectories([
    ...Deno.readDirSync(functionsRoot),
  ]);
  if (invalid.length > 0) {
    console.error(
      `Blocked unexpected deployable Supabase Functions: ${invalid.join(", ")}`,
    );
    Deno.exit(1);
  }
  console.log(
    `Known deploy surfaces verified: production=[${
      [...productionFunctions].sort().join(", ")
    }] testing-pilot=[${
      [...testingPilotFunctions].sort().join(", ")
    }] testing-automation=[${
      [...testingAutomationFunctions].sort().join(", ")
    }]`,
  );
}
