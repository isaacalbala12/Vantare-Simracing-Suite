import { invalidDeployableDirectories } from "./verify-deploy-surface.ts";

Deno.test("deploy surface rejects legacy and unknown top-level functions", () => {
  const entries = [
    { name: "billing-webhook", isDirectory: true },
    { name: "license-credential", isDirectory: true },
    { name: "_shared", isDirectory: true },
    { name: "validate-license", isDirectory: true },
    { name: "README.md", isDirectory: false },
  ] as Deno.DirEntry[];
  const actual = invalidDeployableDirectories(entries);
  if (actual.length !== 1 || actual[0] !== "validate-license") {
    throw new Error(
      `unexpected invalid deploy surface: ${JSON.stringify(actual)}`,
    );
  }
});

Deno.test("official deploy workflow can only deploy through the guarded wrapper", () => {
  const wrapper = Deno.readTextFileSync(
    new URL("./deploy-approved-functions.ps1", import.meta.url),
  );
  const workflow = Deno.readTextFileSync(
    new URL(
      "../../../.github/workflows/deploy-supabase-functions.yml",
      import.meta.url,
    ),
  );
  const guardIndex = wrapper.indexOf("verify-deploy-surface.ps1");
  const deployIndex = wrapper.indexOf("supabase functions deploy");
  if (guardIndex < 0 || deployIndex < 0 || guardIndex >= deployIndex) {
    throw new Error(
      "deploy wrapper does not enforce the surface guard before deployment",
    );
  }
  if (!workflow.includes("deploy-approved-functions.ps1")) {
    throw new Error("official workflow bypasses the guarded deploy wrapper");
  }
  if (!wrapper.includes('"license-credential"')) {
    throw new Error("official wrapper does not deploy the license issuer");
  }
  if (workflow.includes("supabase functions deploy")) {
    throw new Error(
      "official workflow contains an unguarded direct deploy command",
    );
  }
  if (
    !workflow.includes(
      "supabase/setup-cli@3c2f5e2ae34c34e428e8e206e2c4d21fa2d20fbf",
    )
  ) {
    throw new Error(
      "official workflow does not pin the supported Supabase setup action",
    );
  }
  if (workflow.includes("npm install --global supabase")) {
    throw new Error(
      "official workflow uses the unsupported global npm installation",
    );
  }
});

Deno.test("client build receives public verification keys only", () => {
  const files = [
    new URL("../../../.github/workflows/release.yml", import.meta.url),
    new URL("../../../vantare-v2/build/windows/Taskfile.yml", import.meta.url),
    new URL("../../../vantare-v2/cmd/vantare/main.go", import.meta.url),
  ];
  const clientBuildSurface = files.map((file) => Deno.readTextFileSync(file))
    .join("\n");
  if (!clientBuildSurface.includes("VANTARE_LICENSE_PUBLIC_KEYS")) {
    throw new Error("client build does not receive the public key registry");
  }
  if (
    clientBuildSurface.includes("OFFLINE_LICENSE_ED25519_PRIVATE_KEY") ||
    clientBuildSurface.includes("OFFLINE_LICENSE_KEY_ID")
  ) {
    throw new Error("server-side signing material leaked into client build");
  }
});
