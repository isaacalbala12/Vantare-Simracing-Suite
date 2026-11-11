// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import baseScene from "../fixtures/updates-base.json";
import ready from "../fixtures/updates-ready.json";
import type { UpdatesView } from "../src/contract/generated/contract";
import {
  ReleaseNews,
  UpdateChannels,
  UpdateHero,
} from "../src/renderer/ui/UpdatesPresentation";

const base: UpdatesView = { ...baseScene, installation: "development" };
afterEach(cleanup);
it("only declares up-to-date when the observed version actually matches", () => {
  const beta = { ...ready.beta, state: "current", version: base.version };
  const view: UpdatesView = {
    ...base,
    beta,
  };
  const mounted = render(<UpdateHero view={view} />);
  expect(screen.getByText("Estás al día")).toBeTruthy();
  mounted.rerender(
    <UpdateHero view={{ ...view, beta: { ...beta, version: "other" } }} />,
  );
  expect(screen.queryByText("Estás al día")).toBeNull();
  mounted.rerender(
    <UpdateHero view={{ ...view, installation: "invalid", beta: null }} />,
  );
  expect(screen.getByText("No se pudo comprobar la instalación.")).toBeTruthy();
});
it("shows the observed channel without offering a channel mutation", () => {
  render(<UpdateChannels view={{ ...base, channel: "nightly" }} />);
  expect(
    screen.getByText("Canal instalado").closest("[data-active]")?.textContent,
  ).toContain("Nightly");
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getAllByText("No seleccionado")).toHaveLength(2);
});
it("keeps beta separate and lists the installed version even with an empty feed", () => {
  render(
    <>
      <UpdateChannels view={{ ...base, channel: "beta" }} />
      <ReleaseNews view={base} />
    </>,
  );
  expect(screen.getByRole("region", { name: "Beta" })).toBeTruthy();
  expect(screen.queryByText("No seleccionado")).toBeNull();
  expect(screen.getByText(base.version)).toBeTruthy();
  expect(screen.getByText("Instalada")).toBeTruthy();
});
it("deduplicates identical notes while keeping distinct entries with the same title", () => {
  const note = {
    schemaVersion: 1,
    tag: "v1",
    channel: "master",
    title: "Mejora",
    summary: "Primera",
    kind: "Mejora",
  };
  render(
    <ReleaseNews
      view={{ ...base, news: [note, note, { ...note, summary: "Segunda" }] }}
    />,
  );
  expect(screen.getAllByText(/Primera/)).toHaveLength(1);
  expect(screen.getByText(/Segunda/)).toBeTruthy();
});

it("only appends demo invitation hints in the demo presentation", () => {
  const view = render(<UpdateChannels view={base} />);
  expect(screen.queryByText(/Requiere invitación/)).toBeNull();
  view.rerender(<UpdateChannels view={base} demo />);
  expect(screen.getAllByText(/Requiere invitación/)).toHaveLength(2);
});
