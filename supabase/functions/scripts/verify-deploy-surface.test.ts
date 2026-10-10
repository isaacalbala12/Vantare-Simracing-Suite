import { invalidDeployableDirectories } from "./verify-deploy-surface.ts";

Deno.test("native account/admin are recognized without changing default commercial deploy", () => {
  const functions = ["native-account-authorize", "native-admin"];
  if (
    invalidDeployableDirectories(
      functions.map((name) => ({ name, isDirectory: true }) as Deno.DirEntry),
    ).length
  ) {
    throw new Error("native beta functions rejected");
  }
  const config = Deno.readTextFileSync(
    new URL("../../config.toml", import.meta.url),
  ).replaceAll("\r\n", "\n");
  const wrapper = Deno.readTextFileSync(
    new URL("deploy-approved-functions.ps1", import.meta.url),
  );
  for (const name of functions) {
    if (
      !config.includes(`[functions.${name}]\nverify_jwt = false`) ||
      wrapper.includes(`"${name}"`)
    ) {
      throw new Error(
        "beta authentication config or isolated deployment changed",
      );
    }
  }
});

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

Deno.test("native license is guarded and deployable in isolation", () => {
  if (
    invalidDeployableDirectories([
      { name: "native-license", isDirectory: true },
    ] as Deno.DirEntry[]).length !== 0
  ) throw new Error("native license rejected");
  const wrapper = Deno.readTextFileSync(
    new URL("deploy-approved-functions.ps1", import.meta.url),
  );
  const workflow = Deno.readTextFileSync(
    new URL(
      "../../../.github/workflows/deploy-supabase-functions.yml",
      import.meta.url,
    ),
  );
  const config = Deno.readTextFileSync(
    new URL("../../config.toml", import.meta.url),
  ).replaceAll("\r\n", "\n");
  if (
    !wrapper.includes("[ValidateSet(") ||
    !wrapper.includes('"native-license"') ||
    !wrapper.includes("foreach ($functionName in $Functions)") ||
    !workflow.includes('-Functions @("native-license")') ||
    !workflow.includes("default: commercial") ||
    !config.includes("[functions.native-license]\nverify_jwt = false")
  ) {
    throw new Error(
      "native deploy does not have the reviewed isolated surface",
    );
  }
  const defaultFunctions = wrapper.match(/\$Functions = @\(([^\n]+)\)/)?.[1];
  if (!defaultFunctions || defaultFunctions.includes('"native-license"')) {
    throw new Error(
      "native bridge was added to the default commercial deployment",
    );
  }
  if (/& \$guard\s+if \(\$LASTEXITCODE/.test(wrapper)) {
    throw new Error(
      "PowerShell guard incorrectly reuses stale native exit code",
    );
  }
});

Deno.test("testing pilot functions are recognized but remain outside production wrapper", () => {
  const entries = [
    { name: "testing-center-feedback", isDirectory: true },
    { name: "testing-center-linear-webhook", isDirectory: true },
    { name: "testing-center-linear-worker", isDirectory: true },
  ] as Deno.DirEntry[];
  if (invalidDeployableDirectories(entries).length !== 0) {
    throw new Error("reviewed testing pilot surface was rejected");
  }
  const wrapper = Deno.readTextFileSync(
    new URL("./deploy-approved-functions.ps1", import.meta.url),
  );
  if (wrapper.includes("testing-center-linear-worker")) {
    throw new Error("testing pilot leaked into production deployment wrapper");
  }
  const pilotWrapper = Deno.readTextFileSync(
    new URL("./deploy-testing-center-pilot.ps1", import.meta.url),
  );
  if (
    !pilotWrapper.includes("DEPLOY-ISA-243-TESTING-PILOT") ||
    !pilotWrapper.includes("assert-testing-center-pilot-project.ps1") ||
    !pilotWrapper.includes("verify-deploy-surface.ps1") ||
    !pilotWrapper.includes('"testing-center-linear-worker"')
  ) throw new Error("testing pilot wrapper lacks explicit guards");
  if (/& \$guard\s+if \(\$LASTEXITCODE/.test(pilotWrapper)) {
    throw new Error(
      "PowerShell guard incorrectly reuses stale native exit code",
    );
  }
});

Deno.test("agent automation is recognized but remains absent from every deploy wrapper", () => {
  const entries = [
    { name: "testing-center-agent-dispatch", isDirectory: true },
    { name: "testing-center-agent-callback", isDirectory: true },
  ] as Deno.DirEntry[];
  if (invalidDeployableDirectories(entries).length !== 0) {
    throw new Error("reviewed agent automation surface was rejected");
  }
  for (
    const wrapper of [
      "deploy-approved-functions.ps1",
      "deploy-testing-center-pilot.ps1",
    ]
  ) {
    const content = Deno.readTextFileSync(new URL(wrapper, import.meta.url));
    if (
      content.includes('"testing-center-agent-dispatch"') ||
      content.includes('"testing-center-agent-callback"')
    ) {
      throw new Error(
        `agent automation leaked into deploy wrapper: ${wrapper}`,
      );
    }
  }
});

Deno.test("official deploy workflow can only deploy through the guarded wrapper", () => {
  const surfaceGuard = Deno.readTextFileSync(
    new URL("./verify-deploy-surface.ps1", import.meta.url),
  );
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
  for (
    const functionName of [
      "billing-checkout",
      "billing-portal",
      "billing-webhook",
      "license-credential",
    ]
  ) {
    if (!surfaceGuard.includes(`"${functionName}"`)) {
      throw new Error(
        `surface guard does not approve deployed function: ${functionName}`,
      );
    }
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

Deno.test("native client build receives public verification keys only", () => {
  const root = new URL("../../../", import.meta.url);
  const files = [
    "vantare-v2/native/packaging/build-config.ps1",
    "vantare-v2/native/services/src/config.rs",
    "vantare-v2/native/runtime/src/rights/mod.rs",
  ];
  const surface = files.map((file) =>
    Deno.readTextFileSync(new URL(file, root))
  )
    .join("\n");
  if (!surface.includes('option_env!("VANTARE_LICENSE_PUBLIC_KEYS")')) {
    throw new Error("native client omits the public verification key registry");
  }
  for (
    const forbidden of [
      "OFFLINE_LICENSE_ED25519_PRIVATE_KEY",
      "OFFLINE_LICENSE_KEY_ID",
      "CLERK_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]
  ) {
    if (surface.includes(forbidden)) {
      throw new Error(
        `server-side signing material entered client build: ${forbidden}`,
      );
    }
  }
  const config = Deno.readTextFileSync(new URL(files[0], root));
  for (
    const guard of [
      "$name -cnotin $allowed",
      "service_role|sb_secret_",
      "PRIVATE KEY",
      "$claims.role -cne 'anon'",
    ]
  ) {
    if (!config.includes(guard)) {
      throw new Error(`native public-config guard missing: ${guard}`);
    }
  }
});

Deno.test("retired Wails binding pipeline cannot return or publish", () => {
  const root = new URL("../../../", import.meta.url);
  for (
    const retired of [
      "vantare-v2/build/",
      "vantare-v2/cmd/",
      "vantare-v2/frontend/",
      "vantare-v2/tools/generate_supabase_config.ps1",
    ]
  ) {
    let exists = true;
    try {
      Deno.statSync(new URL(retired, root));
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
      exists = false;
    }
    if (exists) throw new Error(`retired client pipeline returned: ${retired}`);
  }
  const release = Deno.readTextFileSync(
    new URL(".github/workflows/release.yml", root),
  );
  if (!release.includes("exit 1") || !release.includes("contents: read")) {
    throw new Error("retired release must remain closed and read-only");
  }
  for (
    const forbidden of [
      "wails3",
      "VITE_SUPABASE",
      "secrets.",
      "contents: write",
    ]
  ) {
    if (release.includes(forbidden)) {
      throw new Error(
        `retired publisher has client credentials or effects: ${forbidden}`,
      );
    }
  }
});
