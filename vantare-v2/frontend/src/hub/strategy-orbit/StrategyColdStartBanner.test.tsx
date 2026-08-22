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
            coldStartStatus: { shouldShow: !rejected, found: rejected ? 0 : 2, imported: 0, decision: rejected ? "rejected" : "pending" },
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
});
