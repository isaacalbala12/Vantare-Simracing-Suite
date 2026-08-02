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
  const stackWrapper = Deno.readTextFileSync(
    new URL("./deploy-approved-billing-stack.ps1", import.meta.url),
  );
  const powershellGuard = Deno.readTextFileSync(
    new URL("./verify-deploy-surface.ps1", import.meta.url),
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
  if (!workflow.includes("deploy-approved-billing-stack.ps1")) {
    throw new Error("official workflow bypasses the guarded stack wrapper");
  }
  if (!wrapper.includes('"license-credential"')) {
    throw new Error("official wrapper does not deploy the license issuer");
  }
  if (!powershellGuard.includes('"license-credential"')) {
    throw new Error("PowerShell surface guard blocks the license issuer");
  }
  const migrationDryRun = stackWrapper.indexOf('"--dry-run"');
  const migrationApply = stackWrapper.indexOf('"--yes",', migrationDryRun + 1);
  const functionsApply = stackWrapper.indexOf("& $functionsDeploy");
  if (
    migrationDryRun < 0 || migrationApply < 0 || functionsApply < 0 ||
    migrationDryRun >= migrationApply || migrationApply >= functionsApply
  ) {
    throw new Error(
      "stack wrapper must dry-run, apply migrations, then deploy Functions",
    );
  }
  if (!stackWrapper.includes('"DEPLOY-BILLING-$ProjectRef"')) {
    throw new Error("stack wrapper lacks exact apply confirmation");
  }
  if (!stackWrapper.includes('"BACKUP-VERIFIED-$ProjectRef"')) {
    throw new Error("stack wrapper lacks exact backup confirmation");
  }
  if (
    !stackWrapper.includes('"FRESH-STAGING-VERIFIED-$ProjectRef"') ||
    !stackWrapper.includes('$Target -eq "staging"')
  ) {
    throw new Error("stack wrapper lacks the narrow fresh-staging exception");
  }
  if (
    !stackWrapper.includes('"link"') ||
    !stackWrapper.includes('"--project-ref", $ProjectRef') ||
    !stackWrapper.includes('"--linked"')
  ) {
    throw new Error(
      "stack wrapper does not bind migrations to the approved project",
    );
  }
  if (!stackWrapper.includes("supabase backups list")) {
    throw new Error("stack wrapper does not verify a remote backup inventory");
  }
  if (!workflow.includes("supabase-${{ inputs.target }}")) {
    throw new Error("workflow does not use a protected target environment");
  }
  if (workflow.includes("SUPABASE_DB_URL")) {
    throw new Error("workflow requires an unnecessary persistent DB password");
  }
  if (
    workflow.includes('-Confirmation "${{ inputs.confirmation }}"') ||
    workflow.includes(
      '-BackupConfirmation "${{ inputs.backup_confirmation }}"',
    )
  ) {
    throw new Error("workflow interpolates free-form inputs into PowerShell");
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

Deno.test("remote smoke tooling has no hardcoded project, account, or payload logging", () => {
  const scripts = [
    "smoke-webhook-deployed.ts",
    "verify-smoke-db.ts",
    "poll-polar-event.ts",
    "list-recent-events.ts",
  ].map((name) => Deno.readTextFileSync(new URL(`./${name}`, import.meta.url)))
    .join("\n");

  const forbidden = [
    "supabase.co/functions/v1/billing-webhook",
    'const USER_ID = "',
    '.select("id,event_type,idempotency_key,user_id,payload,created_at")',
    '.select("id,event_type,idempotency_key,payload,created_at")',
    '.select("id,event_type,idempotency_key,user_id,created_at,payload")',
    "provider_customer_id,email",
    "console.log(JSON.stringify(polarReal",
  ];
  for (const value of forbidden) {
    if (scripts.includes(value)) {
      throw new Error(`unsafe remote smoke tooling marker: ${value}`);
    }
  }
});
