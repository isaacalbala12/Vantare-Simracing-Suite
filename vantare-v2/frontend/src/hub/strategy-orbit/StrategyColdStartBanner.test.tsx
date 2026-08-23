import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StrategyApplicationClient, StrategyApplicationCommandV1, StrategyApplicationResultV1 } from "../../strategy/strategy-application-client";
import { StrategyColdStartBanner } from "./StrategyColdStartBanner";

afterEach(cleanup);

describe("StrategyColdStartBanner", () => {
  it("aparece una vez y conserva el rechazo", async () => {
    let rejected = false;
    const operations: string[] = [];
    const client: StrategyApplicationClient<unknown> = {
      async execute(command: StrategyApplicationCommandV1<unknown>): Promise<StrategyApplicationResultV1<unknown>> {
        operations.push(command.operation);
        if (command.operation === "reject_cold_start") rejected = true;
        return {
          protocolVersion: "strategy.application.v1",
          commandId: command.commandId,
          repositoryVersion: 0,
          ...(command.operation === "get_cold_start_status" ? {
            coldStartStatus: { shouldShow: !rejected, checking: false, found: rejected ? 0 : 2, imported: 0, skipped: 0, failures: [], decision: rejected ? "rejected" : "pending" },
          } : {}),
          recoveredFromBackup: false,
          closed: false,
        };
      },
      cancel: () => false,
      dispose: () => undefined,
    };
    const t = (key: string) => ({
      "strategy.coldStart.title": "Se encontraron {{n}} sesiones de LMU",
      "strategy.coldStart.lead": "Importa tus sesiones",
      "strategy.coldStart.reject": "Ahora no",
      "strategy.coldStart.import": "Importar",
      "strategy.coldStart.importing": "Importando",
      "strategy.coldStart.progress": "{{done}}/{{total}}",
      "strategy.coldStart.error": "Error",
      "strategy.coldStart.checking": "Buscando",
      "strategy.coldStart.checkingLead": "Revisando",
      "strategy.coldStart.statusErrorTitle": "No pudimos consultar",
      "strategy.coldStart.statusError": "La consulta falló",
      "strategy.coldStart.retryStatus": "Reintentar consulta",
      "strategy.coldStart.retrySkipped": "Reintentar omitidas",
      "strategy.coldStart.dismiss": "Cerrar",
      "strategy.coldStart.failureReasons": "Motivos",
      "strategy.coldStart.failureReason": "{{session}}: {{reason}}",
    }[key] ?? key);

    const first = render(<StrategyColdStartBanner client={client} onImported={vi.fn()} t={t} />);
    expect(await screen.findByText("Se encontraron 2 sesiones de LMU")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    await waitFor(() => expect(screen.queryByTestId("orbit-cold-start")).toBeNull());
    first.unmount();

    render(<StrategyColdStartBanner client={client} onImported={vi.fn()} t={t} />);
    await waitFor(() => expect(operations.filter((operation) => operation === "get_cold_start_status")).toHaveLength(2));
    expect(screen.queryByTestId("orbit-cold-start")).toBeNull();
    expect(operations).toContain("reject_cold_start");
  });

  it("mantiene visible el error de consulta y permite reintentar", async () => {
    let attempts = 0;
    const client: StrategyApplicationClient<unknown> = {
      async execute(command): Promise<StrategyApplicationResultV1<unknown>> {
        attempts += 1;
        if (attempts === 1) throw new Error("backend unavailable");
        return {
          protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 0,
          coldStartStatus: { shouldShow: true, checking: false, found: 337, imported: 1, skipped: 0, failures: [], decision: "pending" },
          recoveredFromBackup: false, closed: false,
        };
      },
      cancel: () => false,
      dispose: () => undefined,
    };
    const t = (key: string) => ({
      "strategy.coldStart.statusErrorTitle": "No pudimos consultar",
      "strategy.coldStart.statusError": "La consulta falló",
      "strategy.coldStart.retryStatus": "Reintentar consulta",
      "strategy.coldStart.title": "Se encontraron {{n}} sesiones",
      "strategy.coldStart.lead": "Importa tus sesiones",
      "strategy.coldStart.reject": "Ahora no",
      "strategy.coldStart.import": "Importar",
    }[key] ?? key);

    render(<StrategyColdStartBanner client={client} onImported={vi.fn()} t={t} />);
    expect(await screen.findByText("La consulta falló")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar consulta" }));
    expect(await screen.findByText("Se encontraron 337 sesiones")).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it("muestra cada sesión omitida con su motivo y permite reintentarla", async () => {
    const client: StrategyApplicationClient<unknown> = {
      async execute(command): Promise<StrategyApplicationResultV1<unknown>> {
        return {
          protocolVersion: "strategy.application.v1", commandId: command.commandId, repositoryVersion: 0,
          coldStartStatus: {
            shouldShow: true, checking: false, found: 337, imported: 336, skipped: 1,
            failures: [{ locator: "lmu://session-25", reason: "inspect LMU DuckDB session: historical telemetry source error" }],
            decision: "accepted",
          },
          recoveredFromBackup: false, closed: false,
        };
      },
      cancel: () => false,
      dispose: () => undefined,
    };
    const t = (key: string) => ({
      "strategy.coldStart.title": "Se encontraron {{n}} sesiones",
      "strategy.coldStart.lead": "Importa tus sesiones",
      "strategy.coldStart.dismiss": "Cerrar",
      "strategy.coldStart.retrySkipped": "Reintentar omitidas",
      "strategy.coldStart.failureReasons": "Motivos",
      "strategy.coldStart.failureReason": "{{session}}: {{reason}}",
    }[key] ?? key);

    render(<StrategyColdStartBanner client={client} onImported={vi.fn()} t={t} />);
    expect(await screen.findByText("lmu://session-25: inspect LMU DuckDB session: historical telemetry source error")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar omitidas" })).toBeTruthy();
  });
});
