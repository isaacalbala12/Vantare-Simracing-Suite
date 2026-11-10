// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/launcher-base.json";
import type { LauncherView } from "../src/contract/generated/contract";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";
import { launcherText as text } from "../src/renderer/i18n/launcher";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { LauncherProfiles } from "../src/renderer/ui/launcher/Profiles";

afterEach(cleanup);
function mount(view: LauncherView = structuredClone(fixture)) {
  const onLaunch = vi.fn();
  const onSelect = vi.fn();
  render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <LauncherProfiles
          view={view}
          pending={false}
          accepted={false}
          onSelect={onSelect}
          onLaunch={onLaunch}
          onReload={vi.fn()}
        />
      </TooltipProvider>
    </CSPProvider>,
  );
  return { onLaunch, onSelect };
}
describe("launcher contract", () => {
  it("rejects executable paths, arbitrary commands and malformed revisions", () => {
    const request = {
      method: "launcher.launch",
      profile: "creator",
      baseRevision: "0".repeat(64),
    };
    const wire = (request: unknown) => ({ kind: "request", id: 1, request });
    expect(isUiMessage(wire(request))).toBe(true);
    for (const invalid of [
      { ...request, executable: "C:\\bad.exe" },
      { ...request, command: "bad" },
      { ...request, profile: "" },
      { ...request, baseRevision: "stale" },
    ])
      expect(isUiMessage(wire(invalid))).toBe(false);
    expect(
      isHostMessage({
        kind: "response",
        id: 1,
        result: { method: "launcher.get", value: fixture },
      }),
    ).toBe(true);
    expect(
      isHostMessage({
        kind: "response",
        id: 1,
        result: {
          method: "launcher.get",
          value: { ...fixture, executable: "C:\\bad.exe" },
        },
      }),
    ).toBe(false);
  });
  it("mock preserves CAS, exclusive launch and resident absence", () => {
    const ready = createMockHost("launcher-ready");
    const request = {
      kind: "request",
      id: 1,
      request: {
        method: "launcher.launch",
        profile: "creator",
        baseRevision: fixture.revision,
      },
    };
    expect(
      ready({
        ...request,
        request: { ...request.request, baseRevision: "1".repeat(64) },
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "launcherConflict" } });
    expect(ready(request)).toMatchObject({
      kind: "response",
      result: { accepted: true },
    });
    expect(ready(request)).toMatchObject({
      kind: "failure",
      error: { kind: "busy" },
    });
    expect(createMockHost("launcher-offline")(request)).toMatchObject({
      kind: "failure",
      error: { kind: "coreUnavailable" },
    });
  });
});
describe("launcher profile list", () => {
  it("shows native profiles and disables launch when applications are missing", () => {
    const { onLaunch, onSelect } = mount();
    expect(
      screen.getByRole("button", { name: /Lanzar/ }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByText(
        text.missing(["Le Mans Ultimate", "OBS Studio", "Spotify"]),
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pro" }));
    expect(onSelect).toHaveBeenCalledWith("pro");
    expect(onLaunch).not.toHaveBeenCalled();
  });
  it("launch sends the selected profile rather than an executable", () => {
    const view: LauncherView = structuredClone(fixture);
    view.profiles[0].launchable = true;
    const { onLaunch } = mount(view);
    fireEvent.click(screen.getByRole("button", { name: /Lanzar/ }));
    expect(onLaunch).toHaveBeenCalledWith(view.profiles[0]);
  });
});
