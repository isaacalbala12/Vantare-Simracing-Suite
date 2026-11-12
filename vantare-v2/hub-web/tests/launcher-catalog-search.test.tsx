// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/launcher-apps.json";
import type { CatalogView } from "../src/contract/generated/contract";
import { appText as text } from "../src/renderer/i18n/launcher-apps";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { ApplicationCatalog } from "../src/renderer/ui/launcher/Applications";

afterEach(cleanup);
function Catalog({ value }: { value: CatalogView }) {
  const [query, setQuery] = useState("");
  return (
    <ApplicationCatalog
      value={value}
      query={query}
      onQuery={setQuery}
      pending={false}
      onReload={vi.fn()}
      onScan={vi.fn()}
      onEdit={vi.fn()}
      onFavorite={vi.fn()}
      onRemove={vi.fn()}
      onRetry={vi.fn()}
      onDiscard={vi.fn()}
    />
  );
}
function mount(value: CatalogView = structuredClone(fixture)) {
  render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <Catalog value={value} />
      </TooltipProvider>
    </CSPProvider>,
  );
}
function names() {
  return Array.from(
    document.querySelectorAll(".v-launcher-app-name"),
    (row) =>
      within(row as HTMLElement).getByText(/./, { selector: "strong" })
        .textContent,
  );
}
function search(query: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: text.search }), {
    target: { value: query },
  });
}
it("matches name or category case-insensitively and trims only the query edges", () => {
  mount();
  search("  LE MANS  ");
  expect(names()).toEqual(["Le Mans Ultimate"]);
  search("  sIMULador  ");
  expect(names()).toContain("Le Mans Ultimate");
  search("  \t ");
  expect(names()).toHaveLength(fixture.apps.length);
});
it("does not remove internal spaces or join the application name with its category", () => {
  mount();
  for (const query of ["lemans", "Le  Mans", "ultimate sim", "ultimatesim"]) {
    search(query);
    expect(names()).toEqual([]);
    expect(screen.getByText(text.empty)).toBeTruthy();
  }
});
it("keeps favorites first and follows the native case-sensitive Unicode name order", () => {
  const sample = fixture.apps[0];
  const ordered = ["Zulu", "alpha", "Álpha", "\ue000", "😀"];
  const value: CatalogView = {
    ...fixture,
    apps: [
      ...ordered.toReversed().map((name, index) => ({
        ...sample,
        id: `qa${index}`,
        name,
        favorite: false,
      })),
      { ...sample, id: "favorite", name: "zz favorite", favorite: true },
    ],
  };
  mount(value);
  expect(names()).toEqual(["zz favorite", ...ordered]);
});
