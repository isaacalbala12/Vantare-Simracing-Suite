import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CALENDAR } from "../../calendar/calendar-types";
import { useCalendarStarts } from "./use-calendar-starts";

const { listeners, emit, on } = vi.hoisted(() => ({ listeners: new Map<string, (event: unknown) => void>(), emit: vi.fn(), on: vi.fn() }));
vi.mock("@wailsio/runtime", () => ({ Events: {
  Emit: emit,
  On: (name: string, callback: (event: unknown) => void) => {
    on(name);
    listeners.set(name, callback);
    return () => { listeners.delete(name); };
  },
} }));

afterEach(() => { cleanup(); listeners.clear(); emit.mockReset(); on.mockReset(); vi.useRealTimers(); });
function deliver(name: string, data: unknown) { act(() => { listeners.get(name)?.({ data }); }); }

describe("estado de actualización independiente de calendar:get", () => {
  it("recupera un error de arranque anterior al montaje sin repetir el refresh", () => {
    const { result } = renderHook(() => useCalendarStarts());
    expect(emit).toHaveBeenCalledWith("calendar:refresh:status:get");
    deliver("calendar:refresh:status", { state: "error" });
    deliver("calendar:loaded", { calendar: EMPTY_CALENDAR });
    expect(result.current.refreshState).toBe("error");
    expect(emit).not.toHaveBeenCalledWith("calendar:schedule:refresh");
  });
  it("loaded no confirma el refresh; el resultado explícito sí", () => {
    const { result } = renderHook(() => useCalendarStarts());
    deliver("calendar:refresh:started", {});
    expect(result.current.refreshState).toBe("pending");
    deliver("calendar:loaded", { calendar: EMPTY_CALENDAR });
    expect(result.current.refreshState).toBe("pending");
    deliver("calendar:refresh:result", { ok: true });
    expect(result.current.refreshState).toBe("success");
  });

  it("un fallo conserva el documento visible y no se borra con un get", () => {
    const { result } = renderHook(() => useCalendarStarts());
    deliver("calendar:loaded", { calendar: EMPTY_CALENDAR });
    const before = result.current.calendar;
    deliver("calendar:refresh:started", {});
    deliver("calendar:refresh:result", { ok: false });
    expect(result.current.refreshState).toBe("error");
    expect(result.current.calendar).toBe(before);
    deliver("calendar:loaded", { calendar: EMPTY_CALENDAR });
    expect(result.current.refreshState).toBe("error");
    deliver("calendar:refresh:started", {});
    expect(result.current.refreshState).toBe("pending");
  });

  it("expone errores del servicio y retira sus listeners y reloj", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useCalendarStarts());
    deliver("calendar:error", { message: "test" });
    expect(result.current.calendarError).toBe(true);
    unmount();
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("store de módulo compartido", () => {
  it("dos consumidores comparten suscripción, reloj y peticiones", () => {
    vi.useFakeTimers();
    const first = renderHook(() => useCalendarStarts());
    const second = renderHook(() => useCalendarStarts());

    // Una sola suscripción real por evento del calendario (5 `Events.On`
    // entre los dos, no 10), un solo `setInterval` de 15 s y un solo par de
    // peticiones iniciales.
    expect(on).toHaveBeenCalledTimes(5);
    expect(listeners.size).toBe(5);
    expect(vi.getTimerCount()).toBe(1);
    expect(emit.mock.calls.filter((call) => call[0] === "calendar:get")).toHaveLength(1);
    expect(emit.mock.calls.filter((call) => call[0] === "calendar:refresh:status:get")).toHaveLength(1);

    // Fan-out: un solo `calendar:loaded` actualiza a los dos con la misma
    // instantánea (misma referencia; el cálculo de salidas se hace una vez).
    deliver("calendar:loaded", { calendar: EMPTY_CALENDAR });
    expect(second.result.current).toBe(first.result.current);

    // La suscripción sobrevive al primer desmontaje y se libera con el último.
    first.unmount();
    expect(listeners.size).toBe(5);
    expect(vi.getTimerCount()).toBe(1);
    second.unmount();
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
