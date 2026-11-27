// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AccountView } from "../src/contract/generated/account";
import type { Request } from "../src/contract/generated/contract";
import { isAccount } from "../src/contract/modules/account";
import { createMockHost } from "../src/mock/host";
import { liveAccountScenes } from "../src/mock/modules/account-license";
import {
  foundersCopy,
  licenseDate,
  accountText as text,
} from "../src/renderer/i18n/account.es";
import { AccountPanel } from "../src/renderer/ui/AccountPanel";
import { AccountRail } from "../src/renderer/ui/AccountRail";
import { ToastProvider, TooltipProvider } from "../src/renderer/ui/Layers";

// Fixed zone (R6 of the plan): the screen formats in the computer's zone and
// CI runs in UTC. Worker threads ignore a runtime `process.env.TZ`, so the
// default zone of Intl is pinned to Madrid, as calendar-live-permissions does.
const NativeFormatter = Intl.DateTimeFormat;
beforeEach(() => {
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
    function madridFormatter(locales, options) {
      return new NativeFormatter(locales, {
        ...options,
        timeZone: options?.timeZone ?? "Europe/Madrid",
      });
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
let id = 0;
/** The account the mock host publishes for a scene, after optional actions. */
function account(scene: string, ...actions: Request[]): AccountView {
  const host = createMockHost(scene);
  let value: unknown;
  for (const request of [...actions, { method: "account.get" } as Request]) {
    const reply = host({ kind: "request", id: ++id, request });
    if (reply?.kind === "response" && "value" in reply.result)
      value = reply.result.value;
  }
  if (!isAccount(value)) throw new Error(`invalid account for ${scene}`);
  return value;
}
function show(value: AccountView, demo = false) {
  const props = { value, pending: false, demo, act: async () => {} };
  render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <ToastProvider>
          <AccountPanel {...props} />
          <AccountRail {...props} />
        </ToastProvider>
      </TooltipProvider>
    </CSPProvider>,
  );
}
const purchases = [text.monthly, text.annual, foundersCopy.ES.button];
const purchaseVisible = () =>
  purchases.some((name) => screen.queryByRole("button", { name })) ||
  !!screen.queryByText(text.checkoutNotice) ||
  !!screen.queryByText(foundersCopy.ES.included) ||
  !!screen.queryByRole("button", { name: "EN" });
const rail = () =>
  Object.fromEntries(
    Array.from(document.querySelectorAll(".v-account-rail dl > div")).map(
      (row) => [
        row.querySelector("dt")?.textContent,
        row.querySelector("dd")?.textContent,
      ],
    ),
  );
const notices = () =>
  Array.from(
    document.querySelectorAll(".v-account-page .v-account-notice"),
  ).map((node) => node.textContent);

const scenes = [
  ...liveAccountScenes,
  "cuenta-base",
  "cuenta-sesion",
  "cuenta-founders",
  "cuenta-cambio-sesion",
];
const check: Request = { method: "account.check" };
it("never shows a purchase to a tester in any scene, channel or step of a flow", () => {
  const views = new Map<string, AccountView>();
  const add = (view: AccountView) => views.set(JSON.stringify(view), view);
  for (const scene of scenes)
    for (const name of [scene, `visual-dark:${scene}`]) {
      add(account(name));
      add(account(name, check));
    }
  // Any verified account the host marks as tester, whatever else it holds.
  for (const view of [...views.values()])
    if (view.license)
      add({
        ...view,
        license: { tester: true, status: "active", untilMs: null },
      });
  let testers = 0;
  for (const view of views.values()) {
    if (!view.license?.tester) continue;
    for (const channel of ["development", "nightly", "testers", "stable"]) {
      testers++;
      show({ ...view, channel });
      expect(purchaseVisible(), `${view.name} ${channel}`).toBe(false);
      expect(screen.getByText(text.betaHelpTester)).toBeTruthy();
      cleanup();
    }
  }
  // Positive control: the scenes really put testers on screen.
  expect(testers).toBeGreaterThan(40);
}, 30_000);
it.each(["cuenta-sesion", "cuenta-pro-fecha", "cuenta-founders"])(
  "keeps purchases and Founders unchanged for a non-tester (%s)",
  (scene) => {
    show(account(scene));
    for (const name of purchases)
      expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.getByText(foundersCopy.ES.included)).toBeTruthy();
    expect(screen.getByText(text.checkoutNotice)).toBeTruthy();
    expect(screen.getByText(text.betaHelp)).toBeTruthy();
    expect(screen.queryByText(text.testerAccess)).toBeNull();
  },
);
it("labels the tester and writes the signed date in Spanish, Madrid time", () => {
  show(account("cuenta-tester"));
  expect(
    screen.getAllByText(text.testerAccess, { selector: ".v-account-pill" }),
  ).toHaveLength(1);
  expect(rail()).toEqual({
    Estado: "Conectada",
    "Tipo de acceso": "Tester, gratis durante la beta",
    "Válido hasta": "10 de diciembre de 2026 a las 10:00",
    Canal: "development",
  });
  expect(screen.getByText(text.renewsOnline)).toBeTruthy();
  expect(notices()).toEqual([]);
  // 72 h for a nightly tester; the zone is the host's computer, not UTC.
  cleanup();
  show(account("cuenta-tester-nightly"));
  expect(rail()["Válido hasta"]).toBe("29 de noviembre de 2026 a las 10:00");
  expect(licenseDate(Date.UTC(2026, 6, 1, 22, 30), "Europe/Madrid")).toBe(
    "2 de julio de 2026 a las 0:30",
  );
});
it("drops the fixed rows and shows the date without the tester lines for others", () => {
  show(account("cuenta-pro-fecha"));
  expect(rail()).toEqual({
    Estado: "Conectada",
    "Válido hasta": "26 de diciembre de 2026 a las 10:00",
    Canal: "development",
  });
  expect(screen.queryByText(text.renewsOnline)).toBeNull();
  cleanup();
  // Founders: no end date, so no date row either.
  show(account("cuenta-founders"));
  expect(rail()).toEqual({ Estado: "Conectada", Canal: "development" });
  for (const gone of ["Último acceso", "Durante la beta"])
    expect(screen.queryByText(gone)).toBeNull();
});
it.each([
  [
    "cuenta-tester-caduca",
    "Tu acceso caduca el 27 de noviembre de 2026 a las 6:00. Conéctate a internet y se renovará solo, o pulsa Comprobar acceso.",
  ],
  [
    "cuenta-tester-gracia",
    "Estás en carrera: el acceso sigue hasta que acabe la sesión, como mucho hasta las 10:40.",
  ],
])("chooses the warning by the host's status (%s)", (scene, warning) => {
  const value = account(scene);
  show(value);
  expect(notices()).toEqual([warning]);
  // The warning reuses the existing check; no control is added.
  expect(screen.getAllByRole("button", { name: text.check })).toHaveLength(1);
  cleanup();
  // The screen never compares dates: the same date as «active» warns nothing.
  if (!value.license) throw new Error("license missing");
  show({ ...value, license: { ...value.license, status: "active" } });
  expect(notices()).toEqual([]);
  cleanup();
  // «Comprobar acceso» renews: a new signed date and the warning goes away.
  show(account(scene, check));
  expect(notices()).toEqual(["Derechos verificados y guardados por el núcleo"]);
});
it.each([
  "cuenta-sin-verificar",
  "cuenta-transicion",
  "cuenta-bloqueada-caducada",
  "cuenta-bloqueada-revocada",
])(
  "has no license, date or tester line without verified access (%s)",
  (scene) => {
    const value = account(scene);
    expect(value.license).toBeNull();
    show(value);
    expect(Object.keys(rail())).toEqual(["Estado", "Canal"]);
    expect(screen.queryByText(text.testerAccess)).toBeNull();
  },
);
