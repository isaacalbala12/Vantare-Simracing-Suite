// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  SectionChrome,
  SectionRailSlot,
  SectionTabsSlot,
  SectionTitle,
} from "../src/renderer/app/SectionChrome";
import { isSection } from "../src/renderer/app/sections";
import { ShellLayout } from "../src/renderer/ui/ShellLayout";

afterEach(cleanup);
function Screen() {
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
        rail={<span>Rail {count}</span>}
      />
      <button type="button" onClick={() => setCount(count + 1)}>
        Body {count}
      </button>
    </>
  );
}
function Frame({ show = true }: { show?: boolean }) {
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
      {show ? <Screen /> : <p>Other screen</p>}
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
