import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DELETE_WIDGET_CONFIRM_STORAGE_KEY,
  readDeleteWidgetConfirmEnabled,
} from "../state/delete-widget-confirm";
import {
  DeleteWidgetConfirmProvider,
  useDeleteWidgetConfirm,
} from "./DeleteWidgetConfirmProvider";

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

function Harness(props: { commit(): void; names?: readonly string[] }): React.ReactElement {
  const confirm = useDeleteWidgetConfirm();
  return (
    <button
      type="button"
      data-testid="trigger"
      onClick={() =>
        confirm?.request({ widgetNames: props.names ?? ["Delta"], commit: props.commit })
      }
    >
      delete
    </button>
  );
}

describe("DeleteWidgetConfirmProvider", () => {
  afterEach(() => cleanup());

  it("asks before deleting instead of falling back to the native confirm", () => {
    const commit = vi.fn();
    const nativeConfirm = vi.fn();
    vi.stubGlobal("confirm", nativeConfirm);
    render(
      <DeleteWidgetConfirmProvider storage={memoryStorage()}>
        <Harness commit={commit} />
      </DeleteWidgetConfirmProvider>,
    );

    fireEvent.click(screen.getByTestId("trigger"));

    expect(screen.getByTestId("studio-delete-widget-dialog")).toBeTruthy();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("keeps the widget when the dialog is cancelled or dismissed with Escape", () => {
    const commit = vi.fn();
    render(
      <DeleteWidgetConfirmProvider storage={memoryStorage()}>
        <Harness commit={commit} />
      </DeleteWidgetConfirmProvider>,
    );

    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(screen.getByTestId("studio-delete-widget-cancel"));
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("studio-delete-widget-dialog")).toBeNull();

    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("studio-delete-widget-dialog")).toBeNull();
  });

  it("deletes once confirmed and closes the dialog", () => {
    const commit = vi.fn();
    render(
      <DeleteWidgetConfirmProvider storage={memoryStorage()}>
        <Harness commit={commit} />
      </DeleteWidgetConfirmProvider>,
    );

    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(screen.getByTestId("studio-delete-widget-confirm"));

    expect(commit).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("studio-delete-widget-dialog")).toBeNull();
  });

  it("lists every target when several widgets go at once", () => {
    render(
      <DeleteWidgetConfirmProvider storage={memoryStorage()}>
        <Harness commit={vi.fn()} names={["Delta", "Relative"]} />
      </DeleteWidgetConfirmProvider>,
    );

    fireEvent.click(screen.getByTestId("trigger"));
    const dialog = screen.getByTestId("studio-delete-widget-dialog");
    expect(dialog.textContent).toContain("Delta");
    expect(dialog.textContent).toContain("Relative");
  });

  it("remembers the opt-out and skips the dialog on the next delete", () => {
    const storage = memoryStorage();
    const commit = vi.fn();
    render(
      <DeleteWidgetConfirmProvider storage={storage}>
        <Harness commit={commit} />
      </DeleteWidgetConfirmProvider>,
    );

    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(screen.getByTestId("studio-delete-widget-dont-ask"));
    fireEvent.click(screen.getByTestId("studio-delete-widget-confirm"));
    expect(commit).toHaveBeenCalledOnce();
    expect(storage.getItem(DELETE_WIDGET_CONFIRM_STORAGE_KEY)).toBe("off");

    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.queryByTestId("studio-delete-widget-dialog")).toBeNull();
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("starts silent when the opt-out was stored in a previous session", () => {
    const commit = vi.fn();
    const storage = memoryStorage({ [DELETE_WIDGET_CONFIRM_STORAGE_KEY]: "off" });
    expect(readDeleteWidgetConfirmEnabled(storage)).toBe(false);

    render(
      <DeleteWidgetConfirmProvider storage={storage}>
        <Harness commit={commit} />
      </DeleteWidgetConfirmProvider>,
    );

    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.queryByTestId("studio-delete-widget-dialog")).toBeNull();
    expect(commit).toHaveBeenCalledOnce();
  });
});
