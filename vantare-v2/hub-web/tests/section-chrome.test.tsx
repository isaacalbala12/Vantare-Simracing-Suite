// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SectionChrome,
  SectionRailSlot,
  SectionTabsSlot,
  SectionTitle,
} from "../src/renderer/app/SectionChrome";
import { isSection } from "../src/renderer/app/sections";
import { ContextRail } from "../src/renderer/ui/Frame";
import { ShellLayout } from "../src/renderer/ui/ShellLayout";

afterEach(cleanup);
function Screen({ hideRail = false }: { hideRail?: boolean }) {
  const [count, setCount] = useState(0);
  const [tab, setTab] = useState("first");
  return (
    <>
      <SectionChrome
        title="Roadmap"
        tabs={[
          { id: "first", etiqueta: `Tab ${count}`, visible: true },
          { id: "second", etiqueta: "Other tab", visible: true },
          { id: "hidden", etiqueta: "Hidden tab", visible: false },
        ]}
        activeTab={tab}
        onTabChange={(id) => {
          setTab(id);
          setCount(count + 1);
        }}
        rail={hideRail ? false : <span>Rail {count}</span>}
      />
      <button type="button" onClick={() => setCount(count + 1)}>
        Body {count}
      </button>
    </>
  );
}
function Frame({
  show = true,
  hideRail = false,
}: {
  show?: boolean;
  hideRail?: boolean;
}) {
  return (
    <ShellLayout
      sidebar={<nav aria-label="Navigation" />}
      header={
        <header>
          <SectionTitle fallback="Default" />
          <SectionTabsSlot />
        </header>
      }
      rail={
        <aside>
          <SectionRailSlot fallback={<span>Default rail</span>} />
        </aside>
      }
    >
      {show ? <Screen hideRail={hideRail} /> : <p>Other screen</p>}
    </ShellLayout>
  );
}
describe("screen chrome integration", () => {
  it("shares screen state through header and rail portals", () => {
    render(<Frame />);
    fireEvent.click(screen.getByRole("tab", { name: "Other tab" }));
    expect(screen.getByRole("button", { name: "Body 1" })).toBeTruthy();
    expect(screen.getByText("Rail 1").closest("aside")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Body 1" }));
    expect(
      screen.getByRole("tab", { name: "Tab 2" }).closest("header"),
    ).toBeTruthy();
    expect(screen.getByText("Default rail").parentElement?.hidden).toBe(true);
    expect(screen.queryByRole("tab", { name: "Hidden tab" })).toBeNull();
  });
  it("cleans up the previous screen's title, tabs and rail on navigation", () => {
    const view = render(<Frame />);
    view.rerender(<Frame show={false} />);
    expect(screen.queryByText("Roadmap")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Tab 0" })).toBeNull();
    expect(screen.getByText("Default rail").parentElement?.hidden).toBe(false);
    expect(screen.getByText("Default")).toBeTruthy();
  });
  it("accepts the fixed product routes, never arbitrary module paths", () => {
    expect(isSection("workshop")).toBe(true);
    expect(isSection("notifications")).toBe(true);
    expect(isSection("../other/entry")).toBe(false);
    expect(isSection("unregistered")).toBe(false);
  });
});

it("removes the rail without replacing the screen state, then restores its context", () => {
  const view = render(<Frame />);
  fireEvent.click(screen.getByRole("button", { name: "Body 0" }));
  expect(screen.getByRole("complementary")).toBeTruthy();
  view.rerender(<Frame hideRail />);
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(screen.getByRole("button", { name: "Body 1" })).toBeTruthy();
  expect(view.container.querySelector(".v-shell-body")?.children).toHaveLength(
    1,
  );
  view.rerender(<Frame />);
  expect(screen.getByText("Rail 1").closest("aside")).toBeTruthy();
});
it("restores the default rail when leaving a view that requested full width", () => {
  const view = render(<Frame hideRail />);
  expect(screen.queryByRole("complementary")).toBeNull();
  view.rerender(<Frame show={false} />);
  expect(screen.getByRole("complementary")).toBeTruthy();
  expect(screen.getByText("Default rail").parentElement?.hidden).toBe(false);
});
function PreferenceFrame({
  hide = false,
  collapsed,
  toggle,
}: {
  hide?: boolean;
  collapsed: boolean;
  toggle: () => void;
}) {
  return (
    <ShellLayout
      header={<header />}
      sidebar={<nav />}
      rail={
        <ContextRail
          label="Context"
          collapsed={collapsed}
          onToggle={toggle}
          toggleLabel="Toggle context"
        >
          <SectionRailSlot fallback={<span>Context body</span>} />
        </ContextRail>
      }
    >
      <SectionChrome rail={hide ? false : undefined} />
    </ShellLayout>
  );
}
it.each([false, true])(
  "preserves the user's collapsed preference (%s) across a full-width view",
  (collapsed) => {
    const toggle = vi.fn();
    const view = render(
      <PreferenceFrame collapsed={collapsed} toggle={toggle} />,
    );
    expect(
      screen
        .getByRole("complementary")
        .classList.contains("v-context--collapsed"),
    ).toBe(collapsed);
    view.rerender(
      <PreferenceFrame hide collapsed={collapsed} toggle={toggle} />,
    );
    expect(screen.queryByRole("complementary")).toBeNull();
    view.rerender(<PreferenceFrame collapsed={collapsed} toggle={toggle} />);
    expect(
      screen
        .getByRole("complementary")
        .classList.contains("v-context--collapsed"),
    ).toBe(collapsed);
    expect(toggle).not.toHaveBeenCalled();
  },
);
