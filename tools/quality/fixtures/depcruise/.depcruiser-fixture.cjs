/** Fixture dependency-cruiser config for the negative tests in tools/quality/tests/test_negative.py.
 *  Rules mirror the real .dependency-cruiser.cjs boundaries but scoped to fixtures.
 */
module.exports = {
  forbidden: [
    {
      name: "renderer-no-wails",
      comment: "Renderers must not import the wails/persistence layer.",
      severity: "error",
      from: { path: "clean/renderer\\.ts|violation/renderer\\.ts" },
      to: { path: "wails-mock\\.ts" },
    },
  ],
  options: {
    doNotFollow: "node_modules",
  },
};
