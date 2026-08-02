import { invalidDeployableDirectories } from "./verify-deploy-surface.ts";

Deno.test("deploy surface rejects legacy and unknown top-level functions", () => {
  const entries = [
    { name: "billing-webhook", isDirectory: true },
    { name: "_shared", isDirectory: true },
    { name: "validate-license", isDirectory: true },
    { name: "README.md", isDirectory: false },
  ] as Deno.DirEntry[];
  const actual = invalidDeployableDirectories(entries);
  if (actual.length !== 1 || actual[0] !== "validate-license") {
    throw new Error(`unexpected invalid deploy surface: ${JSON.stringify(actual)}`);
  }
});
