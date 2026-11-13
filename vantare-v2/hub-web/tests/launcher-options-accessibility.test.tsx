// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/launcher-base.json";
import type { LauncherView } from "../src/contract/generated/contract";
import { launcherText as text } from "../src/renderer/i18n/launcher";
import { actionText } from "../src/renderer/i18n/launcher-actions";
import { LauncherApplicationsRail } from "../src/renderer/ui/launcher/ApplicationsRail";

afterEach(cleanup);
function mount(patch: Partial<LauncherView> = {}, pending = false) {
  const onOption = vi.fn();
  const view: LauncherView = { ...structuredClone(fixture), ...patch };
  const tree = (value = view, waiting = pending) => (
    <CSPProvider disableStyleElements>
      <LauncherApplicationsRail
        view={value}
        pending={waiting}
        onOption={onOption}
      />
    </CSPProvider>
  );
  const rendered = render(tree());
  return {
    view,
    onOption,
    rerender: (value: LauncherView, waiting = false) =>
      rendered.rerender(tree(value, waiting)),
  };
}
it("keeps every running-chain option readable by keyboard with its visible reason and sends no writes", async () => {
  const { onOption } = mount({ running: true });
  const reason = screen.getByText(text.runningOptionsReadOnly);
  const controls = [
    ...screen.getAllByRole("combobox"),
    screen.getByRole("switch", { name: actionText.closeOnExit }),
  ];
  expect(controls).toHaveLength(6);
  const user = userEvent.setup();
  for (const control of controls) {
    await user.tab();
    expect(document.activeElement).toBe(control);
    expect(control.hasAttribute("disabled")).toBe(false);
    expect(control.getAttribute("aria-readonly")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toBe(reason.id);
    await user.keyboard(
      control.getAttribute("role") === "switch" ? " " : "{ArrowDown}{Enter}",
    );
    expect(screen.queryByRole("listbox")).toBeNull();
  }
  for (const control of controls) {
    await user.click(control);
    expect(screen.queryByRole("listbox")).toBeNull();
  }
  const section = screen.getByRole("region", { name: text.nextOptions });
  expect(section.getAttribute("aria-label")).toBeNull();
  expect(section.getAttribute("aria-labelledby")).toBe(
    screen.getByRole("heading", { name: text.nextOptions }).id,
  );
  expect(onOption).not.toHaveBeenCalled();
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
});
it("preserves focus when the chain starts, then restores editing when it stops", async () => {
  const { view, onOption, rerender } = mount();
  const user = userEvent.setup();
  const control = screen.getByRole("combobox", { name: text.alreadyRunning });
  await user.tab();
  expect(document.activeElement).toBe(control);
  rerender({ ...view, running: true });
  expect(document.activeElement).toBe(control);
  await user.keyboard("{ArrowDown}{Enter}");
  expect(onOption).not.toHaveBeenCalled();
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(document.activeElement).toBe(control);
  rerender(view);
  expect(document.activeElement).toBe(control);
  expect(screen.queryByText(text.runningOptionsReadOnly)).toBeNull();
  expect(control.getAttribute("aria-readonly")).toBeNull();
  expect(control.getAttribute("aria-describedby")).toBeNull();
  await user.click(control);
  await user.click(await screen.findByRole("option", { name: text.restart }));
  expect(onOption).toHaveBeenCalledExactlyOnceWith(view.profiles[0].id, {
    option: "alreadyRunning",
    value: "restart",
  });
});
it("does not drop focus while saving an option", async () => {
  const { view, onOption, rerender } = mount();
  const user = userEvent.setup();
  const control = screen.getByRole("combobox", { name: text.alreadyRunning });
  await user.tab();
  expect(document.activeElement).toBe(control);
  rerender(view, true);
  expect(document.activeElement).toBe(control);
  expect(control.hasAttribute("disabled")).toBe(false);
  expect(control.getAttribute("aria-busy")).toBe("true");
  await user.click(control);
  await user.click(await screen.findByRole("option", { name: text.restart }));
  expect(onOption).not.toHaveBeenCalled();
});
it("retains the protected-document block", async () => {
  const { onOption } = mount({ protected: true });
  for (const control of [
    ...screen.getAllByRole("combobox"),
    screen.getByRole("switch"),
  ]) {
    expect(control.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(control);
  }
  expect(onOption).not.toHaveBeenCalled();
});
it("does not promise editing after a chain ends when the document is also protected", async () => {
  const { onOption } = mount({ running: true, protected: true });
  expect(screen.queryByText(text.runningOptionsReadOnly)).toBeNull();
  for (const control of [
    ...screen.getAllByRole("combobox"),
    screen.getByRole("switch"),
  ]) {
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toBeNull();
    await userEvent.click(control);
  }
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(onOption).not.toHaveBeenCalled();
});
it("closes an open Select when a chain starts and does not reopen it when the chain ends", async () => {
  const { view, onOption, rerender } = mount();
  const user = userEvent.setup();
  const control = screen.getByRole("combobox", { name: text.alreadyRunning });
  await user.click(control);
  await screen.findByRole("listbox");
  rerender({ ...view, running: true });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(control));
  rerender(view);
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(onOption).not.toHaveBeenCalled();
  await user.click(control);
  await screen.findByRole("listbox");
});
