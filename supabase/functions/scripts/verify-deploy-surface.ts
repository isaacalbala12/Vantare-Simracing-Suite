const allowedFunctions = new Set([
  "billing-checkout",
  "billing-portal",
  "billing-webhook",
  "license-credential",
]);
const infrastructure = new Set(["_deprecated", "_shared", "scripts"]);

export function invalidDeployableDirectories(
  entries: Deno.DirEntry[],
): string[] {
  return entries
    .filter((entry) => entry.isDirectory)
    .map((entry) => entry.name)
    .filter((name) => !infrastructure.has(name) && !allowedFunctions.has(name))
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
    `Deploy surface verified: ${[...allowedFunctions].sort().join(", ")}`,
  );
}
