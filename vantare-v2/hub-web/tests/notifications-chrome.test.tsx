// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import launcher from "../fixtures/launcher-base.json";
import * as host from "../src/renderer/app/Host";
import { UiProvider } from "../src/renderer/app/UiState";
import type { Client } from "../src/renderer/bridge/client";
import { NotificationsPopover } from "../src/renderer/screens/notifications/NotificationsPopover";
import { NotificationsRail } from "../src/renderer/screens/notifications/NotificationsRail";
import {
  NotificationsProvider,
  useNotifications,
} from "../src/renderer/screens/notifications/NotificationsState";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function cache(verified = true, tester = true) {
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  query.setQueryData(host.coreKey, {
    ...host.offline,
    access: { ...host.offline.access, verified, blocked: false, tester },
  });
  return query;
}
it("reads existing launcher profiles and renders the GPUI operational context", async () => {
  const request = vi
    .fn()
    .mockResolvedValue({ method: "launcher.get", value: launcher });
  vi.spyOn(host, "useHost").mockReturnValue({
    client: { request } as unknown as Client,
  });
  const query = cache();
  render(
    <QueryClientProvider client={query}>
      <UiProvider>
        <NotificationsRail />
      </UiProvider>
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole("heading", { name: "Centro operativo" }),
  ).toBeTruthy();
  expect(screen.getByText("Sin salidas próximas")).toBeTruthy();
  expect(screen.getByText("Sin perfiles todavía")).toBeTruthy();
  await screen.findByText(launcher.profiles[0].name);
  expect(
    screen.getByText(`${launcher.profiles[0].apps.length} pasos`),
  ).toBeTruthy();
  expect(request).toHaveBeenCalledExactlyOnceWith({ method: "launcher.get" });
});
it("does not read or disclose profiles without verified access", () => {
  const request = vi.fn();
  vi.spyOn(host, "useHost").mockReturnValue({
    client: { request } as unknown as Client,
  });
  const query = cache(false);
  query.setQueryData(["launcher"], launcher);
  render(
    <QueryClientProvider client={query}>
      <UiProvider>
        <NotificationsRail />
      </UiProvider>
    </QueryClientProvider>,
  );
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByText(launcher.profiles[0].name)).toBeNull();
  expect(screen.queryByText("PRÓXIMAS CARRERAS")).toBeNull();
});
it("explains a failed read and retries the same read-only request", async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error("unavailable"))
    .mockResolvedValue({ method: "launcher.get", value: launcher });
  vi.spyOn(host, "useHost").mockReturnValue({
    client: { request } as unknown as Client,
  });
  render(
    <QueryClientProvider client={cache()}>
      <UiProvider>
        <NotificationsRail />
      </UiProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Reintentar" }),
  );
  await screen.findByText(launcher.profiles[0].name);
  expect(request).toHaveBeenCalledTimes(2);
  expect(
    request.mock.calls.every(([input]) => input.method === "launcher.get"),
  ).toBe(true);
});
function Seed() {
  const center = useNotifications();
  useEffect(() => {
    for (const source of ["beta", "launcher", "system"] as const)
      center.add({
        source,
        severity: "info",
        dedupeKey: source,
        title: source,
        text: source,
      });
  }, [center.add]);
  return (
    <button type="button" onClick={() => center.read()}>
      Leer todos
    </button>
  );
}
it("updates the bell count with read state and tester visibility", async () => {
  vi.spyOn(host, "useHost").mockReturnValue({});
  const query = cache();
  const { container } = render(
    <QueryClientProvider client={query}>
      <UiProvider>
        <NotificationsProvider>
          <Seed />
          <NotificationsPopover />
        </NotificationsProvider>
      </UiProvider>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      container.querySelector(".v-notification-bell-count")?.textContent,
    ).toBe("3"),
  );
  expect(screen.getByRole("button", { name: "Notificaciones" })).toBeTruthy();
  act(() =>
    query.setQueryData(host.coreKey, {
      ...host.offline,
      access: {
        ...host.offline.access,
        verified: true,
        blocked: false,
        tester: false,
      },
    }),
  );
  await waitFor(() =>
    expect(
      container.querySelector(".v-notification-bell-count")?.textContent,
    ).toBe("2"),
  );
  await userEvent.click(screen.getByRole("button", { name: "Leer todos" }));
  expect(container.querySelector(".v-notification-bell-count")).toBeNull();
});
