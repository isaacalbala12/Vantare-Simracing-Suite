import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessGate, useFeatureGate } from "./AccessGate";
import type { AccessContext } from "../../lib/access-policy";

// Mock useAccess to return controlled contexts
const mockUseAccess = vi.fn<() => AccessContext>();
vi.mock("../../lib/access", () => ({
  useAccess: () => mockUseAccess(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const freeAccess: AccessContext = {
  planLabel: "free",
  planStatus: "free",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

const paidAccess: AccessContext = {
  planLabel: "paid_overlays",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

const testerAccess: AccessContext = {
  planLabel: "free",
  planStatus: "free",
  roles: ["tester"],
  isBlocked: false,
  isUnconfigured: false,
};

const blockedAccess: AccessContext = {
  planLabel: "free",
  planStatus: "blocked",
  roles: [],
  isBlocked: true,
  isUnconfigured: false,
};

const unconfiguredAccess: AccessContext = {
  planLabel: "free",
  planStatus: "unconfigured",
  roles: [],
  isBlocked: false,
  isUnconfigured: true,
};

describe("AccessGate", () => {
  it("renders children when feature is allowed for free user", () => {
    mockUseAccess.mockReturnValue(freeAccess);
    render(
      <AccessGate feature="calendar.visual">
        <span data-testid="child">Calendar</span>
      </AccessGate>,
    );

    expect(screen.getByTestId("child")).toBeTruthy();
    expect(screen.queryByTestId("access-gate-locked")).toBeNull();
  });

  it("shows locked state for premium feature on free user", () => {
    mockUseAccess.mockReturnValue(freeAccess);
    render(
      <AccessGate feature="engineer.ai">
        <span data-testid="child">Engineer AI</span>
      </AccessGate>,
    );

    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.getByTestId("access-gate-locked")).toBeTruthy();
    expect(screen.getByText(/disponible para testers/i)).toBeTruthy();
  });

  it("renders children for tester user on premium feature", () => {
    mockUseAccess.mockReturnValue(testerAccess);
    render(
      <AccessGate feature="engineer.ai">
        <span data-testid="child">Engineer AI</span>
      </AccessGate>,
    );

    expect(screen.getByTestId("child")).toBeTruthy();
    expect(screen.queryByTestId("access-gate-locked")).toBeNull();
  });

  it("renders children for paid user on paid feature", () => {
    mockUseAccess.mockReturnValue(paidAccess);
    render(
      <AccessGate feature="overlays.advanced">
        <span data-testid="child">Advanced Overlays</span>
      </AccessGate>,
    );

    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("shows blocked-license message for expired license", () => {
    mockUseAccess.mockReturnValue(blockedAccess);
    render(
      <AccessGate feature="calendar.visual">
        <span data-testid="child">Calendar</span>
      </AccessGate>,
    );

    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.getByTestId("access-gate-locked")).toBeTruthy();
    expect(screen.getByText(/no disponible con la licencia actual/i)).toBeTruthy();
  });

  it("shows unconfigured message for unconfigured license on premium feature", () => {
    mockUseAccess.mockReturnValue(unconfiguredAccess);
    render(
      <AccessGate feature="engineer.ai">
        <span data-testid="child">Engineer AI</span>
      </AccessGate>,
    );

    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.getByTestId("access-gate-locked")).toBeTruthy();
    expect(screen.getByText(/requiere configuración/i)).toBeTruthy();
  });

  it("hides children when hide=true and feature is locked", () => {
    mockUseAccess.mockReturnValue(freeAccess);
    render(
      <AccessGate feature="engineer.ai" hide>
        <span data-testid="child">Hidden</span>
      </AccessGate>,
    );

    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.queryByTestId("access-gate-locked")).toBeNull();
  });

  it("renders custom locked UI when locked prop is provided", () => {
    mockUseAccess.mockReturnValue(freeAccess);
    render(
      <AccessGate feature="engineer.ai" locked={<div data-testid="custom-locked">Custom</div>}>
        <span data-testid="child">Engineer</span>
      </AccessGate>,
    );

    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.getByTestId("custom-locked")).toBeTruthy();
  });
});

describe("useFeatureGate", () => {
  it("returns allowed=true for public feature on free user", () => {
    mockUseAccess.mockReturnValue(freeAccess);
    function Test() {
      const { allowed } = useFeatureGate("calendar.visual");
      return <span data-testid="result">{allowed ? "yes" : "no"}</span>;
    }
    render(<Test />);

    expect(screen.getByTestId("result").textContent).toBe("yes");
  });

  it("returns allowed=false for premium feature on free user", () => {
    mockUseAccess.mockReturnValue(freeAccess);
    function Test() {
      const { allowed } = useFeatureGate("engineer.ai");
      return <span data-testid="result">{allowed ? "yes" : "no"}</span>;
    }
    render(<Test />);

    expect(screen.getByTestId("result").textContent).toBe("no");
  });

  it("returns allowed=true for premium feature on tester", () => {
    mockUseAccess.mockReturnValue(testerAccess);
    function Test() {
      const { allowed } = useFeatureGate("engineer.ai");
      return <span data-testid="result">{allowed ? "yes" : "no"}</span>;
    }
    render(<Test />);

    expect(screen.getByTestId("result").textContent).toBe("yes");
  });
});
