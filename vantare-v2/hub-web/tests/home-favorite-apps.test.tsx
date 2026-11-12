// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import launcherFixture from "../fixtures/launcher-base.json";
import type {
  CoreStatus,
  HomeView,
  LauncherView,
} from "../src/contract/generated/contract";
import homeCorpus from "../src/contract/generated/corpus/home.json";
import { favoriteApps } from "../src/renderer/screens/home/favorite-apps";
import { HomeLayout, type HomeProps } from "../src/renderer/ui/home/HomeLayout";

const core = coreFixture as CoreStatus;
beforeAll(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(cleanup);
function data() {
  const sample = homeCorpus.host[0]?.result;
  if (!sample) throw Error("missing fixture");
  const home = structuredClone(sample.value) as HomeView;
  const launcher = structuredClone(launcherFixture) as LauncherView;
  home.revision = launcher.revision;
  home.protected = false;
  home.favorite = launcher.profiles[0].id;
  home.profiles = [
    {
      id: home.favorite,
      name: "Favorito",
      steps: 4,
      favorite: true,
      lastLaunchedAt: null,
    },
  ];
  launcher.profiles[0].apps = ["obs", "lmu", "obs", "custom:unknown"];
  return { home, launcher };
}
it("uses the favorite's document order, preserves repeats and falls back to an unknown id", () => {
  const { home, launcher } = data();
  const apps = favoriteApps(home, launcher);
  expect(apps.map((app) => app.id)).toEqual([
    "obs",
    "lmu",
    "obs",
    "custom:unknown",
  ]);
  expect(new Set(apps.map((app) => app.key)).size).toBe(4);
  expect(apps[0].name).toBe("OBS Studio");
  expect(apps[3].name).toBe("custom:unknown");
});
it("does not mix revisions, disclose a protected document, or guess another favorite", () => {
  const { home, launcher } = data();
  expect(favoriteApps(home, { ...launcher, revision: "f".repeat(64) })).toEqual(
    [],
  );
  expect(favoriteApps(home, { ...launcher, protected: true })).toEqual([]);
  expect(favoriteApps({ ...home, protected: true }, launcher)).toEqual([]);
  expect(favoriteApps({ ...home, favorite: "missing" }, launcher)).toEqual([]);
  expect(favoriteApps(home, undefined)).toEqual([]);
});
it("renders app tiles with complete accessible names and hides them after access is lost", () => {
  const { home, launcher } = data();
  const props: HomeProps = {
    view: home,
    core: {
      ...core,
      access: { ...core.access, verified: true, blocked: false },
    },
    favoriteApps: favoriteApps(home, launcher),
    name: "Piloto",
    now: new Date(2026, 10, 12, 12),
    selected: home.favorite ?? "",
    pending: false,
    records: [],
    select: vi.fn(),
    launch: vi.fn(),
    navigate: vi.fn(),
    commands: vi.fn(),
    retry: vi.fn(),
  };
  const view = render(<HomeLayout {...props} />);
  const list = screen.getByRole("list", {
    name: "Aplicaciones del perfil favorito",
  });
  expect(
    within(list)
      .getAllByRole("listitem")
      .map((item) => item.getAttribute("aria-label")),
  ).toEqual(["OBS Studio", "Le Mans Ultimate", "OBS Studio", "custom:unknown"]);
  expect(within(list).getAllByText("OBS")).toHaveLength(2);
  view.rerender(
    <HomeLayout
      {...props}
      core={{
        ...props.core,
        access: { ...props.core.access, verified: false },
      }}
    />,
  );
  expect(
    screen.queryByRole("list", { name: "Aplicaciones del perfil favorito" }),
  ).toBeNull();
});
