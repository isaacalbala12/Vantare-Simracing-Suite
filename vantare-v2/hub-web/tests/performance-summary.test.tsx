// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  performanceLevels,
  type TrackView,
} from "../src/contract/generated/settings";
import { PerformancePanel } from "../src/renderer/ui/PerformanceLevels";

afterEach(cleanup);
const track: TrackView = {
  exists: true,
  protected: false,
  level: "balanced",
  customized: false,
  customWidgets: 0,
  hideOffTrack: false,
};
const props = {
  disabled: false,
  pending: false,
  onChange: vi.fn(),
  onStudio: vi.fn(),
};
it("keeps the compact summary consistent with each confirmed table column", () => {
  for (const level of performanceLevels) {
    const view = render(
      <CSPProvider disableStyleElements>
        <PerformancePanel {...props} track={{ ...track, level }} />
      </CSPProvider>,
    );
    const summary = view.container.querySelector(
      ".v-performance-compact-summary",
    );
    expect(summary).not.toBeNull();
    const text = summary?.textContent?.toLowerCase() ?? "";
    const table = screen.getByRole("table", {
      name: "Qué cambia en cada nivel",
      hidden: true,
    });
    const heading =
      table.querySelector("thead [data-current]")?.textContent?.toLowerCase() ??
      "";
    expect(heading).not.toBe("");
    expect(text.startsWith(heading)).toBe(true);
    const cells = table.querySelectorAll("tbody td[data-current]");
    expect(cells).toHaveLength(3);
    for (const cell of cells) expect(cell.textContent).toBeTruthy();
    const widgets = cells[0].textContent?.toLowerCase() ?? "";
    expect(text).toContain(widgets.includes("foto") ? "foto" : widgets);
    expect(text).toContain(cells[1].textContent?.toLowerCase());
    expect(text).toContain(cells[2].textContent?.toLowerCase());
    view.unmount();
  }
});
it.each([
  { exists: false, protected: false },
  { exists: true, protected: true },
])(
  "never invents a cadence for an absent or protected layout (%j)",
  (patch) => {
    const view = render(
      <CSPProvider disableStyleElements>
        <PerformancePanel {...props} disabled track={{ ...track, ...patch }} />
      </CSPProvider>,
    );
    expect(
      view.container.querySelector(".v-performance-compact-summary"),
    ).toBeNull();
  },
);
it("shows the last confirmed cadence while saving", () => {
  const first = render(
    <CSPProvider disableStyleElements>
      <PerformancePanel {...props} track={track} />
    </CSPProvider>,
  );
  const confirmed = first.container.querySelector(
    ".v-performance-compact-summary",
  )?.textContent;
  first.rerender(
    <CSPProvider disableStyleElements>
      <PerformancePanel {...props} pending track={track} />
    </CSPProvider>,
  );
  expect(
    first.container.querySelector(".v-performance-compact-summary")
      ?.textContent,
  ).toBe(confirmed);
});
