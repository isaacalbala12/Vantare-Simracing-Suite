// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useStudioDuplicateShortcut } from "../src/renderer/screens/studio/duplicate-shortcut";

afterEach(cleanup);
function MockEditor({
  duplicate,
  enabled = true,
}: {
  duplicate?: () => Promise<unknown>;
  enabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useStudioDuplicateShortcut({ root, enabled, duplicate });
  return (
    <div ref={root}>
      <button type="button">Widget seleccionado</button>
      <input aria-label="Texto" />
    </div>
  );
}
it("dispatches once, retains focus, and does not claim the mock result is Saved", async () => {
  let finish!: () => void;
  const duplicate = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<MockEditor duplicate={duplicate} />);
  const selected = screen.getByRole("button");
  selected.focus();
  fireEvent.keyDown(selected, { key: "d", ctrlKey: true });
  fireEvent.keyDown(selected, { key: "d", ctrlKey: true });
  await act(async () => {});
  expect(duplicate).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(selected);
  expect(screen.queryByText("Guardado")).toBeNull();
  await act(async () => finish());
  fireEvent.keyDown(selected, { key: "d", ctrlKey: true });
  await act(async () => {});
  expect(duplicate).toHaveBeenCalledTimes(2);
});
it.each(["Rejected", "Unknown", "Conflict"])(
  "releases the shortcut after %s without modifying the widget",
  async (reason) => {
    const duplicate = vi.fn().mockRejectedValue(reason);
    render(<MockEditor duplicate={duplicate} />);
    const selected = screen.getByRole("button");
    for (let index = 0; index < 2; index++) {
      fireEvent.keyDown(selected, { key: "d", ctrlKey: true });
      await act(async () => {});
    }
    expect(duplicate).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  },
);
it("does not handle input, repeat, composition, alternate modifiers, dialogs or a disabled editor", async () => {
  const duplicate = vi.fn().mockResolvedValue(undefined);
  const view = render(<MockEditor duplicate={duplicate} />);
  const selected = screen.getByRole("button");
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "d", ctrlKey: true });
  for (const extra of [
    { repeat: true },
    { isComposing: true },
    { shiftKey: true },
    { altKey: true },
    { metaKey: true },
  ]) {
    fireEvent.keyDown(selected, { key: "d", ctrlKey: true, ...extra });
  }
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  document.body.append(dialog);
  fireEvent.keyDown(selected, { key: "d", ctrlKey: true });
  dialog.remove();
  view.rerender(<MockEditor duplicate={duplicate} enabled={false} />);
  fireEvent.keyDown(selected, { key: "d", ctrlKey: true });
  await act(async () => {});
  expect(duplicate).not.toHaveBeenCalled();
});
it("leaves the shortcut untouched before a host adapter exists", () => {
  render(<MockEditor />);
  expect(
    fireEvent.keyDown(screen.getByRole("button"), { key: "d", ctrlKey: true }),
  ).toBe(true);
});
