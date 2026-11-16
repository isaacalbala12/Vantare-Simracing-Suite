// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Button, IconButton } from "../src/renderer/ui/Button";
import { Tooltip, TooltipProvider } from "../src/renderer/ui/Layers";

afterEach(cleanup);

it("exposes a tooltip and preserves the real button's name and other description", async () => {
  render(
    <TooltipProvider delay={0}>
      <span id="existing-note">Description already present</span>
      <Tooltip id="action-help" label="Additional explanation">
        <Button aria-describedby="existing-note action-help">
          Local action
        </Button>
      </Tooltip>
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  await user.tab();
  const button = screen.getByRole("button", { name: "Local action" });
  expect(document.activeElement).toBe(button);
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip.id).toBe("action-help");
  expect(button.getAttribute("aria-describedby")?.split(" ")).toEqual([
    "existing-note",
    "action-help",
  ]);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(document.activeElement).toBe(button);
});

it("keeps a disabled tooltip button focusable and blocks click, Enter and Space centrally", async () => {
  const activate = vi.fn(),
    double = vi.fn(),
    key = vi.fn();
  render(
    <TooltipProvider delay={0}>
      <Button>Before</Button>
      <Tooltip id="disabled-help" label="Currently unavailable">
        <Button
          disabled
          focusableWhenDisabled
          aria-describedby="disabled-help"
          onClick={activate}
          onDoubleClick={double}
          onKeyDown={key}
          onKeyUp={key}
        >
          Blocked action
        </Button>
      </Tooltip>
      <Button disabled onClick={activate}>
        Without tooltip
      </Button>
      <Button onClick={activate}>After</Button>
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  await user.tab();
  await user.tab();
  const blocked = screen.getByRole("button", { name: "Blocked action" });
  expect(document.activeElement).toBe(blocked);
  expect(blocked.hasAttribute("disabled")).toBe(false);
  expect(blocked.getAttribute("aria-disabled")).toBe("true");
  expect((await screen.findByRole("tooltip")).id).toBe("disabled-help");
  key.mockClear();
  await user.click(blocked);
  await user.dblClick(blocked);
  await user.keyboard("{Enter} ");
  expect(activate).not.toHaveBeenCalled();
  expect(double).not.toHaveBeenCalled();
  expect(key).not.toHaveBeenCalled();
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "After" }),
  );
  expect(
    screen
      .getByRole("button", { name: "Without tooltip" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await user.keyboard("{Enter}");
  expect(activate).toHaveBeenCalledTimes(1);
});

it("does not repeat icon names as descriptions or make disabled icons tabbable", async () => {
  render(
    <TooltipProvider delay={0}>
      <IconButton label="First action">
        <span aria-hidden="true">1</span>
      </IconButton>
      <IconButton label="Second action" disabled>
        <span aria-hidden="true">2</span>
      </IconButton>
    </TooltipProvider>,
  );
  const first = screen.getByRole("button", { name: "First action" });
  const second = screen.getByRole("button", { name: "Second action" });
  const ids = [first, second].map((button) =>
    button.getAttribute("aria-describedby"),
  );
  expect(ids).toEqual([null, null]);
  expect(second.hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
  await userEvent.setup().hover(first);
  expect((await screen.findByRole("tooltip")).textContent).toBe("First action");
});

it("does not submit a form while a described submit button is disabled", async () => {
  const submit = vi.fn((event) => event.preventDefault());
  const result = render(
    <TooltipProvider delay={0}>
      <form onSubmit={submit}>
        <Tooltip id="submit-help" label="Wait for validation">
          <Button
            type="submit"
            disabled
            focusableWhenDisabled
            aria-describedby="submit-help"
          >
            Submit
          </Button>
        </Tooltip>
      </form>
    </TooltipProvider>,
  );
  const button = screen.getByRole("button", { name: "Submit" });
  const user = userEvent.setup();
  await user.tab();
  await screen.findByRole("tooltip");
  await user.dblClick(button);
  await user.keyboard("{Enter} ");
  expect(submit).not.toHaveBeenCalled();
  result.rerender(
    <TooltipProvider delay={0}>
      <form onSubmit={submit}>
        <Tooltip id="submit-help" label="Wait for validation">
          <Button type="submit" aria-describedby="submit-help">
            Submit
          </Button>
        </Tooltip>
      </form>
    </TooltipProvider>,
  );
  expect(document.activeElement).toBe(button);
  expect(button.getAttribute("aria-disabled")).not.toBe("true");
  expect(screen.getByRole("tooltip").textContent).toBe("Wait for validation");
  await user.click(button);
  expect(submit).toHaveBeenCalledOnce();
});
