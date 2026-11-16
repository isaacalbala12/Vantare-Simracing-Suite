// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render as renderTree,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStudioFocus } from "../src/renderer/screens/studio/focus";
import { dialogShortcut } from "../src/renderer/ui/hub-shortcuts";

const fixture = vi.hoisted(() => ({
  execute: vi.fn(),
  view: {
    revision: "a".repeat(64),
    state: "ready",
    plan: "verified",
    canUndo: true,
    canRedo: true,
    instances: [],
  },
  pending: false,
}));
vi.mock("../src/renderer/app/UiState", () => ({
  useUi: (select: (value: unknown) => unknown) =>
    select({ studioLastSelected: null, rememberStudio: () => {} }),
}));
vi.mock("../src/renderer/screens/studio/state", () => ({
  useStudio: () => ({
    ...fixture,
    selected: null,
    setSelected: vi.fn(),
    focusAfter: { current: undefined },
  }),
}));
function Probe() {
  useStudioFocus();
  return <button type="button">Editor</button>;
}
function render(node: ReactNode) {
  const client = new QueryClient();
  return renderTree(node, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
beforeEach(() => {
  fixture.execute.mockReset();
  fixture.pending = false;
  Object.assign(fixture.view, {
    revision: "a".repeat(64),
    state: "ready",
    plan: "verified",
    canUndo: true,
    canRedo: true,
  });
});
afterEach(cleanup);
const chord = { key: "y", ctrlKey: true };
describe("Studio history keyboard requests", () => {
  it.each([
    [chord, "studio.redo"],
    [{ key: "Y", ctrlKey: true }, "studio.redo"],
    [{ key: "y", metaKey: true }, "studio.redo"],
    [{ key: "z", ctrlKey: true, shiftKey: true }, "studio.redo"],
    [{ key: "z", ctrlKey: true }, "studio.undo"],
  ])(
    "sends one exact request with the current CAS revision: %j",
    (init, method) => {
      const screen = render(<Probe />);
      fireEvent.keyDown(screen.getByRole("button"), init);
      expect(fixture.execute).toHaveBeenCalledExactlyOnceWith({
        method,
        baseRevision: "a".repeat(64),
      });
      fixture.view.revision = "b".repeat(64);
      screen.rerender(<Probe />);
      fireEvent.keyDown(screen.getByRole("button"), init);
      expect(fixture.execute).toHaveBeenLastCalledWith({
        method,
        baseRevision: "b".repeat(64),
      });
    },
  );
  it.each([
    { repeat: true },
    { isComposing: true },
    { altKey: true },
    { metaKey: true },
    { shiftKey: true },
    { ctrlKey: false },
  ])("does not send for a different or repeated chord: %j", (extra) => {
    const screen = render(<Probe />);
    fireEvent.keyDown(screen.getByRole("button"), { ...chord, ...extra });
    expect(fixture.execute).not.toHaveBeenCalled();
  });
  it.each([
    "input",
    "textarea",
    "select",
    'div contenteditable="true"',
    'div role="combobox"',
    'div role="menu"',
  ])("leaves editing and widget navigation alone: %s", (markup) => {
    render(<Probe />);
    const container = document.createElement("div");
    container.innerHTML = `<${markup}><span></span></${markup.split(" ")[0]}>`;
    document.body.append(container);
    const element = container.firstElementChild as HTMLElement;
    fireEvent.keyDown(
      element.tagName === "DIV"
        ? (element.firstElementChild as HTMLElement)
        : element,
      chord,
    );
    expect(fixture.execute).not.toHaveBeenCalled();
    container.remove();
  });
  it.each(["dialog", "alertdialog"])("never edits behind a %s", (role) => {
    const screen = render(
      <>
        <Probe />
        <div role={role} />
      </>,
    );
    fireEvent.keyDown(screen.getByRole("button"), chord);
    expect(fixture.execute).not.toHaveBeenCalled();
  });
  it.each(["pending", "noRedo", "protected", "unverified"])(
    "does not send while %s",
    (mode) => {
      if (mode === "pending") fixture.pending = true;
      if (mode === "noRedo") fixture.view.canRedo = false;
      if (mode === "protected") fixture.view.state = "protected";
      if (mode === "unverified") fixture.view.plan = "unverified";
      const screen = render(<Probe />);
      fireEvent.keyDown(screen.getByRole("button"), chord);
      expect(fixture.execute).not.toHaveBeenCalled();
    },
  );
  it("ignores prevented events and AltGraph, and unregisters on exit", () => {
    const screen = render(<Probe />);
    const event = new KeyboardEvent("keydown", {
      ...chord,
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    fireEvent(screen.getByRole("button"), event);
    const altGraph = new KeyboardEvent("keydown", { ...chord, bubbles: true });
    Object.defineProperty(altGraph, "getModifierState", { value: () => true });
    fireEvent(screen.getByRole("button"), altGraph);
    screen.unmount();
    fireEvent.keyDown(window, chord);
    expect(fixture.execute).not.toHaveBeenCalled();
  });
  it("blocks redo on the inert background but preserves native text redo", () => {
    expect(dialogShortcut(new KeyboardEvent("keydown", chord))).toBe(true);
    const input = document.createElement("input");
    const event = new KeyboardEvent("keydown", { ...chord, bubbles: true });
    let blocked: boolean | undefined;
    input.addEventListener("keydown", (e) => {
      blocked = dialogShortcut(e);
    });
    input.dispatchEvent(event);
    expect(blocked).toBe(false);
  });
});
