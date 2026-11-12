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
  it("allows AltGr and composing Escape, blocks only registered shortcuts and toggles the top palette", () => {
    document.body.innerHTML =
      '<div id="popup" tabindex="-1"><input data-command-palette /></div>';
    const popup = document.getElementById("popup");
    if (!popup) throw new Error("Missing popup");
    const safety = dialogSafety(document),
      stop = safety.listen(),
      close = vi.fn();
    const release = safety.register({ node: popup, close });
    try {
      for (const key of ["@", "#", "\\", "[", "]", "{", "}", "|", "~"]) {
        const event = new KeyboardEvent("keydown", {
          key,
          ctrlKey: true,
          altKey: true,
          bubbles: true,
          cancelable: true,
        });
        popup.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
      const rail = new KeyboardEvent("keydown", {
        key: "b",
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      popup.dispatchEvent(rail);
      expect(rail.defaultPrevented).toBe(true);
      const alt = new KeyboardEvent("keydown", {
        key: "@",
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(alt, "getModifierState", {
        value: (key: string) => key === "AltGraph",
      });
      popup.dispatchEvent(alt);
      expect(alt.defaultPrevented).toBe(false);
      fireEvent.keyDown(popup, { key: "Escape", isComposing: true });
      expect(close).not.toHaveBeenCalled();
      const other = new KeyboardEvent("keydown", {
        key: "j",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      popup.dispatchEvent(other);
      expect(other.defaultPrevented).toBe(false);
      fireEvent.keyDown(popup, { key: "k", ctrlKey: true });
      expect(close).toHaveBeenCalledOnce();
    } finally {
      release();
      stop();
    }
  });
  it("keeps notices and header actions inert, leaves toast actions available, and restores everything", async () => {
    document.body.innerHTML =
      '<header class="v-titlebar"><div><button>Bell</button><button role="tab">Tab</button></div><div class="v-window-controls"><button>Min</button></div></header><main class="v-shell-main"></main><div class="v-toast-viewport"><button>Retry</button></div><div id="popup" tabindex="-1"><button>Cancel</button></div>';
    const popup = document.getElementById("popup");
    if (!popup) throw new Error("Missing popup");
    const safety = dialogSafety(document),
      stop = safety.listen();
    const release = safety.register({ node: popup, close: () => {} });
    const notice = document.createElement("div");
    notice.dataset.windowDialog = "notice";
    document.body.append(notice);
    await waitFor(() => expect(notice.hasAttribute("inert")).toBe(true));
    const retry = document.querySelector<HTMLButtonElement>(
      ".v-toast-viewport button",
    );
    retry?.focus();
    expect(document.activeElement).toBe(retry);
    const headerActions = document.querySelector(".v-titlebar > div");
    expect(headerActions?.hasAttribute("inert")).toBe(true);
    const click = vi.fn();
    for (const action of headerActions?.querySelectorAll("button") ?? []) {
      action.addEventListener("click", click);
      fireEvent.click(action);
    }
    expect(click).not.toHaveBeenCalled();
    release();
    stop();
    expect(notice.hasAttribute("inert")).toBe(false);
    expect(headerActions?.hasAttribute("inert")).toBe(false);
  });
  it("only dismisses on left backdrop clicks and cleans inert when unmounted open", async () => {
    const tree = render(
      <WindowDialogProvider>
        <main className="v-shell-main">
          <WindowDialog.Root defaultOpen>
            <WindowDialog.Portal>
              <WindowDialog.Backdrop data-testid="backdrop" />
              <WindowDialog.Popup>
                <WindowDialog.Title>Test</WindowDialog.Title>
                <WindowDialog.Description>Local</WindowDialog.Description>
                <button type="button">Cancel</button>
              </WindowDialog.Popup>
            </WindowDialog.Portal>
          </WindowDialog.Root>
        </main>
      </WindowDialogProvider>,
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.pointerDown(screen.getByTestId("backdrop"), { button: 2 });
    expect(dialog.isConnected).toBe(true);
    const main = document.querySelector(".v-shell-main");
    tree.unmount();
    expect(main?.hasAttribute("inert")).toBe(false);
    const second = render(
      <WindowDialogProvider>
        <WindowDialog.Root defaultOpen>
          <WindowDialog.Portal>
            <WindowDialog.Backdrop data-testid="backdrop" />
            <WindowDialog.Popup>
              <WindowDialog.Title>Test</WindowDialog.Title>
              <WindowDialog.Description>Local</WindowDialog.Description>
            </WindowDialog.Popup>
          </WindowDialog.Portal>
        </WindowDialog.Root>
      </WindowDialogProvider>,
    );
    fireEvent.pointerDown(screen.getByTestId("backdrop"), { button: 0 });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    second.unmount();
  });
  it("restores focus and inert through two real nested WindowDialogs", async () => {
    const user = userEvent.setup();
    render(
      <WindowDialogProvider>
        <main className="v-shell-main">
          <WindowDialog.Root>
            <WindowDialog.Trigger>Outer</WindowDialog.Trigger>
            <WindowDialog.Portal>
              <WindowDialog.Popup>
                <WindowDialog.Title>Outer dialog</WindowDialog.Title>
                <WindowDialog.Description>First</WindowDialog.Description>
                <WindowDialog.Root>
                  <WindowDialog.Trigger>Inner</WindowDialog.Trigger>
                  <WindowDialog.Portal>
                    <WindowDialog.Popup>
                      <WindowDialog.Title>Inner dialog</WindowDialog.Title>
                      <WindowDialog.Description>
                        Second
                      </WindowDialog.Description>
                      <WindowDialog.Close>Cancel inner</WindowDialog.Close>
                    </WindowDialog.Popup>
                  </WindowDialog.Portal>
                </WindowDialog.Root>
              </WindowDialog.Popup>
            </WindowDialog.Portal>
          </WindowDialog.Root>
        </main>
      </WindowDialogProvider>,
    );
    const origin = screen.getByRole("button", { name: "Outer" });
    await user.click(origin);
    const innerTrigger = await screen.findByRole("button", { name: "Inner" });
    const outer = screen.getByRole("dialog", { name: "Outer dialog" });
    await user.click(innerTrigger);
    await screen.findByRole("dialog", { name: "Inner dialog" });
    expect(outer.hasAttribute("inert")).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(innerTrigger));
    expect(outer.hasAttribute("inert")).toBe(false);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(origin));
  });
  it("yields focus, Escape and keyboard input to Access without closing the retained editor", () => {
    document.body.innerHTML =
      '<main class="v-shell-main"></main><div id="editor" tabindex="-1"><input /></div><dialog open><input id="login" /><button>Gate close</button></dialog>';
    const editor = document.getElementById("editor"),
      login = document.getElementById("login");
    if (!editor || !login) throw new Error("Missing fixture");
    const safety = dialogSafety(document),
      stop = safety.listen(),
      close = vi.fn();
    const release = safety.register({ node: editor, close });
    try {
      login.focus();
      expect(document.activeElement).toBe(login);
      const escapeEvent = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      login.dispatchEvent(escapeEvent);
      expect(close).not.toHaveBeenCalled();
      expect(escapeEvent.defaultPrevented).toBe(false);
      const tab = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      login.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(false);
      document.querySelector("dialog")?.remove();
      fireEvent.keyDown(editor, { key: "Escape" });
      expect(close).toHaveBeenCalledOnce();
    } finally {
      release();
      stop();
    }
  });
  it("closes a nested Select before its confirmation and restores focus in order", async () => {
    const user = userEvent.setup();
    render(
      <WindowDialogProvider>
        <main className="v-shell-main">
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
      '<header class="v-titlebar"><div class="v-window-controls"><button>Min</button><button>Max</button><button>Close</button></div></header><nav class="v-sidebar"><button>Launch</button></nav><main class="v-shell-main"><button id="behind">Save</button></main><div role="dialog" tabindex="-1" id="popup"><input/><button>Cancel</button></div>';
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
        document.querySelector(".v-shell-main")?.hasAttribute("inert"),
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
    expect(document.querySelector(".v-shell-main")?.hasAttribute("inert")).toBe(
      false,
    );
    expect(document.querySelector(".v-sidebar")?.hasAttribute("inert")).toBe(
      false,
    );
  });
  it("restores a parent dialog and preserves pre-existing inert state after nesting and unmount", () => {
    document.body.innerHTML =
      '<main class="v-shell-main" inert></main><nav class="v-sidebar"></nav><div id="outer" tabindex="-1"></div><div id="inner" tabindex="-1"></div>';
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
    expect(document.querySelector(".v-shell-main")?.hasAttribute("inert")).toBe(
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
          <main className="v-shell-main">
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
      fireEvent.keyDown(dialog, { key: "Escape", isComposing: true });
      expect(dialog.isConnected).toBe(true);
      expect(
        document.querySelector(".v-shell-main")?.hasAttribute("inert"),
      ).toBe(true);
      await user.keyboard("{Escape}");
      await waitFor(() => expect(dialog.isConnected).toBe(false));
      await waitFor(() => expect(document.activeElement).toBe(trigger));
      expect(
        document.querySelector(".v-shell-main")?.hasAttribute("inert"),
      ).toBe(false);
    },
  );
});
