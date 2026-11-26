// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

// VANTA-138 P6 (#2785): the real content tells Main, once per page, that it
// mounted; Main only then lets the launcher confirm the generation.
const { reportMounted } = vi.hoisted(() => ({ reportMounted: vi.fn() }));
vi.mock("../src/renderer/bridge/mounted", () => ({ reportMounted }));
afterEach(() => {
  cleanup();
  reportMounted.mockClear();
  vi.resetModules();
});

function Broken(): never {
  throw new Error("content failed to mount");
}
it("reports once per page, whatever content mounts or re-renders", async () => {
  const { HubMounted } = await import("../src/renderer/app/HubMounted");
  const view = render(<HubMounted />);
  expect(reportMounted).toHaveBeenCalledOnce();
  view.rerender(<HubMounted />);
  render(<HubMounted />);
  expect(reportMounted).toHaveBeenCalledOnce();
});
it("does not report a content that fails before committing", async () => {
  const { HubMounted } = await import("../src/renderer/app/HubMounted");
  const silence = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() =>
    render(
      <>
        <Broken />
        <HubMounted />
      </>,
    ),
  ).toThrow("content failed to mount");
  silence.mockRestore();
  expect(reportMounted).not.toHaveBeenCalled();
});
