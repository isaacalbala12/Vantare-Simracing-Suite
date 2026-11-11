// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ResidentView } from "../src/contract/generated/contract";
import { residentActionLabels } from "../src/contract/generated/launcher_resident";
import { ResidentInbox } from "../src/renderer/screens/launcher/resident";
import { TooltipProvider } from "../src/renderer/ui/Layers";

const view: ResidentView = {
  protected: false,
  online: true,
  running: true,
  error: false,
  decision: {
    id: "18446744073709551615",
    kind: "authorization",
    actions: [
      { id: "trust", label: residentActionLabels.trust },
      { id: "cancel", label: residentActionLabels.cancel },
    ],
  },
  registrations: [],
};
afterEach(cleanup);
function mount(value: ResidentView) {
  return render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <ResidentInbox view={value} />
      </TooltipProvider>
    </CSPProvider>,
  );
}
describe("resident decisions are read-only", () => {
  it("shows the native actions disabled and Escape only closes the local drawer", async () => {
    const mounted = mount(view);
    expect(
      screen.getByRole("dialog", { name: "Decisión de lanzamiento" }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: residentActionLabels.trust,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: residentActionLabels.cancel,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    mounted.rerender(
      <CSPProvider disableStyleElements>
        <TooltipProvider>
          <ResidentInbox view={structuredClone(view)} />
        </TooltipProvider>
      </CSPProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver decisión" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("removes stale decisions and displays only a closed error state", () => {
    mount({
      ...view,
      online: false,
      running: false,
      error: false,
      decision: null,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("El lanzamiento no se completó.")).toBeNull();
  });
});
