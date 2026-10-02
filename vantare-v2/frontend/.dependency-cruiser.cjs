/** Dependency-cruiser config: fronteras VERIFICABLES hoy en el codigo + ciclos.
 *
 * Fronteras derivadas de ADR 0003 y vantare-v2/AGENTS.md:
 *  - Los renderizadores visuales (design-systems, widget-types) no acceden a
 *    persistencia/Wails (no @wailsio, no @supabase).
 *  - El canvas de Overlay Studio no accede a persistencia/Wails.
 * Solo se anaden fronteras verificables hoy (sin violaciones actuales). No se
 * inventa la arquitectura "deseada". dependency-cruiser usa su baseline nativo
 * (.dependency-cruiser-known-violations.json) para known violations.
 *
 * Extension .cjs: el frontend es ESM (package.json "type": "module").
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Ciclos prohibidos en codigo fuente.",
      severity: "error",
      from: { path: "^src/" },
      to: { circular: true },
    },
    {
      name: "renderers-no-wails",
      comment: "Los renderizadores visuales (design-systems) no acceden a Wails.",
      severity: "error",
      from: { path: "^src/overlay/design-systems/" },
      to: { path: "^@wailsio/" },
    },
    {
      name: "renderers-no-supabase",
      comment: "Los renderizadores visuales (design-systems) no acceden a persistencia (supabase).",
      severity: "error",
      from: { path: "^src/overlay/design-systems/" },
      to: { path: "^@supabase/" },
    },
    {
      name: "widget-types-no-wails",
      comment: "Los widget-types no acceden a Wails.",
      severity: "error",
      from: { path: "^src/overlay/widget-types/" },
      to: { path: "^@wailsio/" },
    },
    {
      name: "widget-types-no-supabase",
      comment: "Los widget-types no acceden a persistencia (supabase).",
      severity: "error",
      from: { path: "^src/overlay/widget-types/" },
      to: { path: "^@supabase/" },
    },
    {
      name: "canvas-no-wails",
      comment: "El canvas de Overlay Studio no accede a Wails.",
      severity: "error",
      from: { path: "^src/hub/overlay-studio/canvas/" },
      to: { path: "^@wailsio/" },
    },
    {
      name: "canvas-no-supabase",
      comment: "El canvas de Overlay Studio no accede a persistencia (supabase).",
      severity: "error",
      from: { path: "^src/hub/overlay-studio/canvas/" },
      to: { path: "^@supabase/" },
    },
  ],
  options: {
    doNotFollow: ["^node_modules/"],
    exclude: {
      path: ["^src/generated/", "^bindings/", "\\.test\\.(ts|tsx)$", "\\.spec\\.(ts|tsx)$"],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.app.json" },
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js", ".jsx", ".json"] },
  },
};
