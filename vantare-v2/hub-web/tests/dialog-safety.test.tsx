// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dialogSafety } from "../src/renderer/ui/dialog-safety";
import { Select } from "../src/renderer/ui/Forms";
import {
  WindowAlertDialog,
  WindowDialog,
  WindowDialogProvider,
} from "../src/renderer/ui/WindowDialog";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});
describe("partial-window modality", () => {
  it("closes a nested Select before its confirmation and restores focus in order", async () => {
    const user = userEvent.setup();
    render(
      <WindowDialogProvider>
        <main className="v-shell-body">
          <WindowDialog.Root>
            <WindowDialog.Trigger>Open nested</WindowDialog.Trigger>
            <WindowDialog.Portal>
              <WindowDialog.Backdrop className="v-backdrop" />
              <WindowDialog.Popup>
                <WindowDialog.Title>Nested</WindowDialog.Title>
                <WindowDialog.Description>
                  Choose before confirming
                </WindowDialog.Description>
                <Select
                  label="Choice"
                  value="one"
                  onChange={() => {}}
                  options={[
                    { value: "one", label: "One" },
                    { value: "two", label: "Two" },
                  ]}
                />
              </WindowDialog.Popup>
            </WindowDialog.Portal>
          </WindowDialog.Root>
        </main>
      </WindowDialogProvider>,
    );
    const origin = screen.getByRole("button", { name: "Open nested" });
    await user.click(origin);
    const choice = await screen.findByRole("combobox");
    await user.click(choice);
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(screen.getByRole("dialog")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(choice));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(origin));
  });
  it("blocks background focus and launch/save shortcuts while retaining every caption control", () => {
    document.body.innerHTML =
      '<header class="v-titlebar"><div class="v-window-controls"><button>Min</button><button>Max</button><button>Close</button></div></header><nav class="v-sidebar"><button>Launch</button></nav><main class="v-shell-body"><button id="behind">Save</button></main><div role="dialog" tabindex="-1" id="popup"><input/><button>Cancel</button></div>';
    const safety = dialogSafety(document),
      stop = safety.listen(),
      close = vi.fn();
    const popup = document.getElementById("popup");
    if (!popup) throw new Error("Fixture missing");
    const release = safety.register({ node: popup, close });
    const leaked = vi.fn();
    window.addEventListener("keydown", leaked);
    try {
      expect(
        document.querySelector(".v-shell-body")?.hasAttribute("inert"),
      ).toBe(true);
      expect(document.querySelector(".v-sidebar")?.hasAttribute("inert")).toBe(
        true,
      );
      expect(
        document.querySelector(".v-titlebar")?.closest("[inert]"),
      ).toBeNull();
      const backgroundAction = document.createElement("button");
      document.querySelector(".v-titlebar")?.append(backgroundAction);
      const action = vi.fn();
      backgroundAction.addEventListener("click", action);
      fireEvent.click(backgroundAction);
      expect(action).not.toHaveBeenCalled();
      for (const button of document.querySelectorAll<HTMLButtonElement>(
        ".v-window-controls button",
      )) {
        button.focus();
        expect(document.activeElement).toBe(button);
      }
      for (let i = 0; i < 12; i++) {
        fireEvent.keyDown(document.activeElement ?? popup, { key: "Tab" });
        expect(
          document.activeElement?.closest(".v-window-controls,#popup"),
        ).toBeTruthy();
      }
      fireEvent.keyDown(document.activeElement ?? popup, {
        key: "l",
        ctrlKey: true,
      });
      fireEvent.keyDown(document.activeElement ?? popup, {
        key: "s",
        ctrlKey: true,
      });
      expect(leaked).not.toHaveBeenCalledWith(
        expect.objectContaining({ ctrlKey: true }),
      );
      fireEvent.keyDown(popup, { key: "Escape" });
      expect(close).toHaveBeenCalledOnce();
      document.getElementById("behind")?.focus();
      expect(
        document.activeElement?.closest(".v-window-controls,#popup"),
      ).toBeTruthy();
    } finally {
      release();
      stop();
      window.removeEventListener("keydown", leaked);
    }
    expect(document.querySelector(".v-shell-body")?.hasAttribute("inert")).toBe(
      false,
    );
    expect(document.querySelector(".v-sidebar")?.hasAttribute("inert")).toBe(
      false,
    );
  });
  it("restores a parent dialog and preserves pre-existing inert state after nesting and unmount", () => {
    document.body.innerHTML =
      '<main class="v-shell-body" inert></main><nav class="v-sidebar"></nav><div id="outer" tabindex="-1"></div><div id="inner" tabindex="-1"></div>';
    const outer = document.getElementById("outer"),
      inner = document.getElementById("inner");
    if (!outer || !inner) throw new Error("Fixture missing");
    const safety = dialogSafety(document),
      stop = safety.listen();
    const first = safety.register({ node: outer, close: () => {} }),
      second = safety.register({ node: inner, close: () => {} });
    expect(outer.hasAttribute("inert")).toBe(true);
    second();
    expect(outer.hasAttribute("inert")).toBe(false);
    expect(document.querySelector(".v-sidebar")?.hasAttribute("inert")).toBe(
      true,
    );
    first();
    stop();
    expect(document.querySelector(".v-shell-body")?.hasAttribute("inert")).toBe(
      true,
    );
    expect(document.querySelector(".v-sidebar")?.hasAttribute("inert")).toBe(
      false,
    );
  });
  it.each([WindowDialog, WindowAlertDialog])(
    "Escape closes and returns focus to the originating trigger",
    async (Parts) => {
      const user = userEvent.setup();
      render(
        <WindowDialogProvider>
          <header className="v-titlebar">
            <div className="v-window-controls">
              <button type="button">Min</button>
              <button type="button">Max</button>
              <button type="button">Close</button>
            </div>
          </header>
          <main className="v-shell-body">
            <Parts.Root>
              <Parts.Trigger>Open</Parts.Trigger>
              <Parts.Portal>
                <Parts.Backdrop className="v-backdrop" />
                <Parts.Popup className="v-dialog">
                  <Parts.Title>Confirm</Parts.Title>
                  <Parts.Description>Local only</Parts.Description>
                  <Parts.Close>Cancel</Parts.Close>
                </Parts.Popup>
              </Parts.Portal>
            </Parts.Root>
          </main>
        </WindowDialogProvider>,
      );
      const trigger = screen.getByRole("button", { name: "Open" });
      await user.click(trigger);
      const dialog = await screen.findByRole(
        Parts === WindowAlertDialog ? "alertdialog" : "dialog",
      );
      expect(
        document.querySelector(".v-shell-body")?.hasAttribute("inert"),
      ).toBe(true);
      await user.keyboard("{Escape}");
      await waitFor(() => expect(dialog.isConnected).toBe(false));
      await waitFor(() => expect(document.activeElement).toBe(trigger));
      expect(
        document.querySelector(".v-shell-body")?.hasAttribute("inert"),
      ).toBe(false);
    },
  );
});
