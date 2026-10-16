const productionFunctions = new Set([
  "billing-checkout",
  "billing-portal",
  "billing-webhook",
  "license-credential",
  "native-billing-checkout",
  "native-billing-portal",
  "native-license",
  "native-account-authorize",
  "native-admin",
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
  // Review candidate, absent from all deploy wrappers.
  "testing-report-submit",
  "clerk-webhook",
  "billing-reconcile",
  "billing-report-promotion",
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

export function invalidPromotionGatewayConfig(config: string): boolean {
  const block = config.replaceAll("\r\n", "\n").match(
    /\[functions\.billing-report-promotion\]([^[]*)/,
  );
  return !block || !/^\s*verify_jwt\s*=\s*false\s*$/m.test(block[1]);
}

if (import.meta.main) {
  const functionsRoot = new URL("..", import.meta.url);
  if (
    invalidPromotionGatewayConfig(
      Deno.readTextFileSync(new URL("../../config.toml", import.meta.url)),
    )
  ) {
    console.error(
      "billing-report-promotion must declare verify_jwt=false; handler owns server authentication",
    );
    Deno.exit(1);
  }
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
