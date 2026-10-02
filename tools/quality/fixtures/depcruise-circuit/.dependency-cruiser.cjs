/** Fixture config for run_dependency_cruiser circuit test. */
module.exports = {
  forbidden: [
    {
      name: "renderer-no-wails",
      severity: "error",
      from: { path: "src/renderer\\.ts" },
      to: { path: "src/wails-mock\\.ts" },
    },
  ],
  options: {
    doNotFollow: "node_modules",
  },
};
