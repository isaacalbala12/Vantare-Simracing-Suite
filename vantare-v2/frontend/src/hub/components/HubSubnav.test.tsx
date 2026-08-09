import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HubSubnav } from "./HubSubnav";
import { HubSubnavSlotContext } from "./hub-subnav-slot";

afterEach(cleanup);

describe("HubSubnav", () => {
  it("moves its content into the shell slot when the shell provides one", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);

    render(
      <HubSubnavSlotContext.Provider value={slot}>
        <div data-testid="page">
          <HubSubnav>
            <button type="button">Cuenta</button>
          </HubSubnav>
        </div>
      </HubSubnavSlotContext.Provider>,
    );

    const tab = screen.getByRole("button", { name: "Cuenta" });
    expect(slot.contains(tab)).toBe(true);
    expect(screen.getByTestId("page").contains(tab)).toBe(false);

    slot.remove();
  });

  // A page rendered on its own -- which is how the page tests render it -- has
  // no shell around it. The bar has to still be there, not silently vanish.
  it("renders in place when there is no slot", () => {
    render(
      <div data-testid="page">
        <HubSubnav>
          <button type="button">Cuenta</button>
        </HubSubnav>
      </div>,
    );

    expect(screen.getByTestId("page").contains(screen.getByRole("button", { name: "Cuenta" }))).toBe(
      true,
    );
  });
});
