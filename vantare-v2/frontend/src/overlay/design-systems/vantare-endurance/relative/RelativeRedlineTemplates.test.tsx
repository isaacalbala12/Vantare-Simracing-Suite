import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  RelativeRowViewModel,
  RelativeViewModel,
} from "../../../widget-types/relative/relative-view-model";
import { RelativeRedlineTemplate } from "./RelativeRedlineTemplates";
import { RelativeEndurance } from "./RelativeEndurance";

afterEach(() => cleanup());

function row(
  id: string,
  side: RelativeRowViewModel["side"],
  isPlayer = false,
): RelativeRowViewModel {
  return {
    id,
    position: 1,
    vehicleClass: "HYPERCAR",
    driverNumber: "7",
    driverName: id,
    gapText: "—",
    bestLapText: "—",
    lastLapText: "—",
    isPlayer,
    side,
    tone: isPlayer ? "player" : "neutral",
    gapSeconds: isPlayer ? 0 : null,
  };
}

const neutralPitModel: RelativeViewModel = {
  type: "relative",
  status: "ready",
  columns: [],
  rowHeightMode: "compact",
  rows: [
    row("ahead-far", "ahead"),
    row("ahead-near", "ahead"),
    row("player", "player", true),
    row("behind-near", "behind"),
    row("behind-far", "behind"),
  ],
};

const scopedPitModel: RelativeViewModel = {
  ...neutralPitModel,
  presentationKey: "desktop:relative-traffic:1:session-a",
};

function renderTraffic(model: RelativeViewModel) {
  return render(
    <RelativeEndurance
      model={model}
      settings={{ templateId: "relative-redline-traffic", showHeader: true }}
      renderMode="desktop"
    />,
  );
}

describe("RelativeRedlineTemplate", () => {
  it.each(["mirror", "proximity", "traffic"] as const)(
    "keeps %s rows stable without FLIP or ghost animations",
    (variant) => {
      const animate = vi.fn(() => ({}) as Animation);
      const originalAnimate = HTMLElement.prototype.animate;
      HTMLElement.prototype.animate = animate;
      const first = {
        ...scopedPitModel,
        rows: [
          row("ahead", "ahead"),
          row("player", "player", true),
          row("behind", "behind"),
        ],
      };
      const reordered = {
        ...scopedPitModel,
        rows: [
          row("behind", "ahead"),
          row("player", "player", true),
          row("ahead", "behind"),
        ],
      };

      try {
        const view = render(
          <RelativeRedlineTemplate
            model={first}
            settings={{}}
            variant={variant}
            showHeader={false}
          />,
        );
        animate.mockClear();
        view.rerender(
          <RelativeRedlineTemplate
            model={reordered}
            settings={{}}
            variant={variant}
            showHeader={false}
          />,
        );

        expect(animate).not.toHaveBeenCalled();
        expect(view.container.querySelectorAll("[data-relative-row]")).toHaveLength(3);
        expect(view.container.querySelectorAll("[data-ghost='true']")).toHaveLength(0);
      } finally {
        HTMLElement.prototype.animate = originalAnimate;
      }
    },
  );

  it("keeps an upper Traffic threat and its lap alert in one non-overlapping slot during churn", () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const element = this as HTMLElement;
      const block = element.closest(".ven-rel-block");
      if (!block || element.classList.contains("ven-rel-root")) {
        return new DOMRect(0, 0, 430, 0);
      }
      const owners = [...block.children].filter((child) =>
        child.matches("[data-relative-row], [data-relative-motion-row]"),
      );
      const owner = element.closest("[data-relative-motion-row]") ?? element;
      const index = owners.indexOf(owner);
      const ownerHeight = (candidate: Element) =>
        candidate.matches("[data-relative-motion-row]") ? 50 : 30;
      const ownerTop = owners.slice(0, Math.max(0, index))
        .reduce((top, candidate) => top + ownerHeight(candidate), 0);
      if (element.classList.contains("ven-rel-lapnote")) {
        return new DOMRect(0, ownerTop, 430, 20);
      }
      if (element.matches("[data-relative-row]") && element.closest("[data-relative-motion-row]")) {
        return new DOMRect(0, ownerTop + 20, 430, 30);
      }
      return new DOMRect(0, ownerTop, 430, ownerHeight(owner));
    });
    const animate = vi.fn(() => ({}) as Animation);
    const originalAnimate = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate;
    const player = { ...row("player", "player", true), vehicleClass: "LMP2" };
    const threat = {
      ...row("faster-threat", "behind"),
      vehicleClass: "HYPERCAR",
      gapSeconds: -0.1,
    };
    const other = row("other", "ahead");
    const first = { ...scopedPitModel, rows: [other, player, threat] };
    const moved = { ...scopedPitModel, rows: [threat, other, player] };

    try {
      const view = renderTraffic(first);
      animate.mockClear();
      view.rerender(
        <RelativeEndurance
          model={moved}
          settings={{ templateId: "relative-redline-traffic", showHeader: true }}
          renderMode="desktop"
        />,
      );

      const wrapper = view.container.querySelector<HTMLElement>(
        '[data-relative-motion-row="faster-threat"]',
      );
      const threatRow = view.container.querySelector<HTMLElement>(
        '[data-relative-row="faster-threat"]',
      );
      expect(wrapper?.querySelector(".ven-rel-lapnote")).toBeTruthy();
      expect(wrapper?.contains(threatRow ?? null)).toBe(true);
      const alertRect = wrapper!.querySelector(".ven-rel-lapnote")!.getBoundingClientRect();
      const intersections = [...view.container.querySelectorAll<HTMLElement>("[data-relative-row]")]
        .filter((candidate) => {
          const rowRect = candidate.getBoundingClientRect();
          return Math.min(alertRect.right, rowRect.right) > Math.max(alertRect.left, rowRect.left) &&
            Math.min(alertRect.bottom, rowRect.bottom) > Math.max(alertRect.top, rowRect.top);
        });
      expect(intersections).toEqual([]);
      expect(animate).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.animate = originalAnimate;
      rectSpy.mockRestore();
    }
  });

  it("renders an empty Traffic model immediately because interruption hold belongs to the VM", () => {
    const { container, rerender } = renderTraffic(scopedPitModel);

    rerender(
      <RelativeEndurance
        model={{ ...scopedPitModel, status: "missing", rows: [] }}
        settings={{ templateId: "relative-redline-traffic", showHeader: true }}
        renderMode="desktop"
      />,
    );

    expect(container.querySelectorAll("[data-relative-row]")).toHaveLength(0);

    rerender(
      <RelativeEndurance
        model={scopedPitModel}
        settings={{ templateId: "relative-redline-traffic", showHeader: true }}
        renderMode="desktop"
      />,
    );
    expect(container.querySelectorAll("[data-relative-row]")).toHaveLength(5);
  });

  it("does not retain Traffic rows for a real disconnect", () => {
    const { container, rerender } = renderTraffic(scopedPitModel);

    rerender(
      <RelativeEndurance
        model={{ ...scopedPitModel, status: "disconnected", rows: [] }}
        settings={{ templateId: "relative-redline-traffic", showHeader: true }}
        renderMode="desktop"
      />,
    );

    expect(container.querySelectorAll("[data-relative-row]")).toHaveLength(0);
  });

  it("does not retain Traffic rows across a presentation scope change", () => {
    const { container, rerender } = renderTraffic(scopedPitModel);

    rerender(
      <RelativeEndurance
        model={{ ...scopedPitModel, presentationKey: "desktop:relative-traffic:2:session-b", rows: [] }}
        settings={{ templateId: "relative-redline-traffic", showHeader: true }}
        renderMode="desktop"
      />,
    );

    expect(container.querySelectorAll("[data-relative-row]")).toHaveLength(0);
  });

  it("keeps neutral pit rows on their physical side in mirror", () => {
    const { container } = render(
      <RelativeRedlineTemplate
        model={neutralPitModel}
        settings={{}}
        variant="mirror"
        showHeader={false}
      />,
    );

    expect(
      container.querySelector('[data-relative-row="ahead-near"] .ven-rel-gap')?.getAttribute("data-side"),
    ).toBe("ahead");
    expect(
      container.querySelector('[data-relative-row="behind-near"] .ven-rel-gap')?.getAttribute("data-side"),
    ).toBe("behind");
    expect(container.querySelectorAll("[data-relative-row]")).toHaveLength(5);
  });

  it("keeps neutral pit rows on their physical side in proximity", () => {
    const { container } = render(
      <RelativeRedlineTemplate
        model={neutralPitModel}
        settings={{}}
        variant="proximity"
        showHeader={false}
      />,
    );

    expect(
      container.querySelector('[data-relative-row="ahead-near"] .ven-rel-gapcell')?.getAttribute("data-side"),
    ).toBe("ahead");
    expect(
      container.querySelector('[data-relative-row="behind-near"] .ven-rel-gapcell')?.getAttribute("data-side"),
    ).toBe("behind");
  });
});
