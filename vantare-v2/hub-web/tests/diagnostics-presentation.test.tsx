// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { diagnosticsText as text } from "../src/renderer/i18n/diagnostics.es";
import {
  DiagnosticHealth,
  DiagnosticLog,
} from "../src/renderer/ui/DiagnosticsPresentation";

afterEach(cleanup);
function Log() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  return (
    <CSPProvider disableStyleElements>
      <DiagnosticLog
        events={[
          { section: "privacy", code: "conflict", sequence: 1 },
          { section: "services", code: "busy", sequence: 2 },
        ]}
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        onClear={() => {
          setQuery("");
          setFilter("all");
        }}
      />
    </CSPProvider>
  );
}
it("filters observed messages and clears both controls without fabricating timestamps", async () => {
  render(<Log />);
  const user = userEvent.setup();
  expect(screen.getAllByText(text.noTime)).toHaveLength(2);
  await user.type(
    screen.getByRole("searchbox", { name: text.search }),
    "Servicios",
  );
  expect(screen.getByText("Operación en curso")).toBeTruthy();
  expect(screen.queryByText("El documento ha cambiado")).toBeNull();
  await user.click(screen.getByRole("button", { name: text.error }));
  await user.click(screen.getByRole("button", { name: text.clear }));
  expect(screen.getAllByText(text.noTime)).toHaveLength(2);
  expect(
    screen.getByRole("button", { name: "Todos" }).getAttribute("aria-pressed"),
  ).toBe("true");
});
it("does not present unavailable status queries as healthy or configured", () => {
  render(
    <DiagnosticHealth
      live={false}
      launching={undefined}
      preferences={undefined}
      configured={undefined}
      prepared={false}
    />,
  );
  expect(screen.getAllByText(text.unavailable)).toHaveLength(3);
  expect(screen.getByText(text.notPrepared)).toBeTruthy();
  expect(screen.getByText(text.waiting)).toBeTruthy();
});
