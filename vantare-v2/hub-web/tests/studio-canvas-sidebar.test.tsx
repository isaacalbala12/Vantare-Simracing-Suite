// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { UiProvider, useUi } from "../src/renderer/app/UiState";

afterEach(cleanup);
function Probe() {
  const ui = useUi((s) => s);
  return (
    <>
      <output data-testid="side">{String(ui.sidebarCollapsed)}</output>
      <output data-testid="list">{String(ui.studioListCollapsed)}</output>
      <button type="button" onClick={ui.toggleSidebar}>
        manual
      </button>
      <button type="button" onClick={() => ui.canvasSidebar(true)}>
        enter
      </button>
      <button type="button" onClick={() => ui.canvasSidebar(false)}>
        leave
      </button>
      <button type="button" onClick={ui.toggleStudioList}>
        list
      </button>
      <button type="button" onClick={() => ui.adaptSidebar(1920)}>
        resize
      </button>
    </>
  );
}
it("collapses temporarily, respects a manual opening and restores the prior sidebar", () => {
  render(
    <UiProvider>
      <Probe />
    </UiProvider>,
  );
  if (screen.getByTestId("side").textContent === "true")
    fireEvent.click(screen.getByText("manual"));
  expect(screen.getByTestId("side").textContent).toBe("false");
  fireEvent.click(screen.getByText("enter"));
  expect(screen.getByTestId("side").textContent).toBe("true");
  fireEvent.click(screen.getByText("resize"));
  expect(screen.getByTestId("side").textContent).toBe("true");
  fireEvent.click(screen.getByText("manual"));
  expect(screen.getByTestId("side").textContent).toBe("false");
  fireEvent.click(screen.getByText("enter"));
  expect(screen.getByTestId("side").textContent).toBe("false");
  fireEvent.click(screen.getByText("leave"));
  expect(screen.getByTestId("side").textContent).toBe("false");
});
it("remembers the widget list choice across canvas exits", () => {
  render(
    <UiProvider>
      <Probe />
    </UiProvider>,
  );
  fireEvent.click(screen.getByText("enter"));
  fireEvent.click(screen.getByText("list"));
  fireEvent.click(screen.getByText("leave"));
  fireEvent.click(screen.getByText("enter"));
  expect(screen.getByTestId("list").textContent).toBe("true");
});
