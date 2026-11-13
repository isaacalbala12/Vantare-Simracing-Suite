// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  CalendarLaunchPlan,
  CalendarLaunchView,
} from "../src/contract/generated/calendar";
import { calendarLaunchText } from "../src/renderer/i18n/calendarLaunch";
import { CalendarLaunchStatus } from "../src/renderer/ui/CalendarLaunchStatus";

afterEach(cleanup);
const plan: CalendarLaunchPlan = {
  armId: "a".repeat(64),
  profile: "qa",
  profileName: "Perfil QA",
  decisionRequired: true,
  mode: { kind: "once", seriesId: "s", startAt: 1800000180000 },
};
const empty: CalendarLaunchView = {
  armed: null,
  automatic: null,
  latest: null,
  change: null,
};
it("keeps the host-bound profile, open-Hub and Ask warnings visible and cancels by opaque id only", () => {
  const cancel = vi.fn();
  const h = render(
    <CalendarLaunchStatus
      value={{ ...empty, armed: plan }}
      busy={false}
      utc
      onCancel={cancel}
    />,
  );
  expect(screen.getByText(/Perfil QA.*lanzamiento programado/)).toBeTruthy();
  expect(screen.getByText(/solo mientras el Hub/)).toBeTruthy();
  expect(screen.getByText(/Launcher para responder/)).toBeTruthy();
  expect(screen.getByText(/2 min/)).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Cancelar lanzamiento puntual" }),
  );
  expect(cancel).toHaveBeenCalledWith(plan.armId);
  h.rerender(
    <CalendarLaunchStatus
      value={{ ...empty, armed: plan }}
      busy
      utc
      onCancel={cancel}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Cancelar lanzamiento puntual" }),
  );
  expect(cancel).toHaveBeenCalledOnce();
});
it("never presents queued or a missing receipt as completed and preserves typed terminal outcomes", () => {
  const latest = {
    armId: plan.armId,
    profileName: plan.profileName,
    seriesId: "s",
    startAt: 1800000180000,
  };
  const show = (
    progress: NonNullable<CalendarLaunchView["latest"]>["progress"],
  ) => (
    <CalendarLaunchStatus
      value={{ ...empty, latest: { ...latest, progress } }}
      busy={false}
      utc
      onCancel={vi.fn()}
    />
  );
  const h = render(show({ kind: "queued", request: "a".repeat(32) }));
  expect(screen.getByText(/esperando recibo/)).toBeTruthy();
  expect(screen.queryByText("Secuencia completada.")).toBeNull();
  h.rerender(
    show({ kind: "unknown", request: "a".repeat(32), reason: "noReceipt" }),
  );
  expect(screen.getByText(/No se puede confirmar el resultado/)).toBeTruthy();
  expect(screen.queryByText("Secuencia completada.")).toBeNull();
  h.rerender(
    show({
      kind: "finished",
      request: "a".repeat(32),
      run: "1",
      outcome: { kind: "failed", reason: "decision-expired" },
    }),
  );
  expect(screen.getByText(/2 min/)).toBeTruthy();
  expect(screen.queryByText("Secuencia completada.")).toBeNull();
  h.rerender(
    show({
      kind: "finished",
      request: "a".repeat(32),
      run: "1",
      outcome: { kind: "completed" },
    }),
  );
  expect(screen.getByText("Secuencia completada.")).toBeTruthy();
});

it("uses distinct cancellation names and an explicit live region for the latest result", () => {
  render(
    <CalendarLaunchStatus
      value={{
        ...empty,
        armed: plan,
        automatic: {
          ...plan,
          armId: "b".repeat(64),
          mode: { kind: "alerts", expectedRevision: "c".repeat(64) },
        },
        latest: {
          armId: plan.armId,
          profileName: plan.profileName,
          seriesId: "s",
          startAt: 1800000180000,
          progress: { kind: "queued", request: "a".repeat(32) },
        },
      }}
      busy={false}
      utc
      onCancel={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Cancelar lanzamiento puntual" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "Cancelar lanzamiento autom\u00e1tico",
    }),
  ).toBeTruthy();
  const latest = document.querySelector("[data-calendar-launch-result]");
  expect(latest?.querySelector(".v-callout")?.getAttribute("role")).toBe(
    "status",
  );
  expect(latest?.getAttribute("aria-live")).toBe("polite");
});

it("announces the discarded punctual and coincident automatic departures while the original chain remains pending", () => {
  const value: CalendarLaunchView = {
    ...empty,
    automatic: {
      ...plan,
      armId: "b".repeat(64),
      mode: { kind: "alerts", expectedRevision: "c".repeat(64) },
    },
    change: { plan, reason: "busy" },
    latest: {
      armId: "d".repeat(64),
      profileName: "Cadena anterior",
      seriesId: "old",
      startAt: 1800000180000,
      progress: { kind: "queued", request: "e".repeat(32) },
    },
  };
  render(
    <CalendarLaunchStatus value={value} busy={false} utc onCancel={vi.fn()} />,
  );
  expect(
    screen.getByText(calendarLaunchText.punctualBusy).getAttribute("role"),
  ).toBe("status");
  expect(screen.getByText(calendarLaunchText.queued)).toBeTruthy();
  expect(screen.getByText("Cadena anterior")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: calendarLaunchText.cancelOnce }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: calendarLaunchText.cancelAutomatic }),
  ).toBeTruthy();
  expect(screen.queryByText(/tiene prioridad/)).toBeNull();
});
