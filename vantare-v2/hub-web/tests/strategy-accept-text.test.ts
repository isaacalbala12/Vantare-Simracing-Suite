import { describe, expect, it } from "vitest";
import type {
  StrategyAcceptedView,
  StrategyChange,
  StrategyPlanView,
} from "../src/contract/generated/strategy";
import {
  acceptedDay,
  acceptedOn,
  acceptedTag,
  canAccept,
  changeLabel,
  changeLine,
  changeValue,
  differenceText,
  differsFromAccepted,
  durationNote,
  isAcceptedOnly,
  isAcceptedOnView,
  isCleanProposal,
  planCard,
  secondsText,
  unreachableText,
} from "../src/renderer/screens/strategy/planText";

// The words of the acceptance of a plan, written from what the host sends:
// nothing here recalculates a plan.

const metrics = {
  totalSeconds: 21664,
  laps: 236,
  pitCount: 5,
  fuelReserveRealLaps: 1.14,
  fuelReserveRequiredLaps: 0.8,
};
const timeline = {
  pilot: "Isaac",
  basePaceSeconds: 90.472,
  fuelStartLiters: 82,
  fuelFinishLiters: 2.1,
  veStartPercent: 100,
  veFinishPercent: 4,
  stints: [{ fromLap: 1, toLap: 236 }],
  pits: [],
};
const result = (patch: Partial<StrategyPlanView["result"] & object> = {}) => ({
  certificate: "proven" as const,
  steps: { fuelLiters: 1, vePercent: 1 },
  degraded: false,
  reason: null,
  metrics,
  timeline,
  ...patch,
});
const accepted = (
  patch: Partial<StrategyAcceptedView> = {},
): StrategyAcceptedView => ({
  state: "accepted",
  acceptedAt: "2026-11-19T18:42:00Z",
  saved: true,
  result: result(),
  changes: [],
  unreachable: null,
  compare: null,
  ...patch,
});
const plan = (patch: Partial<StrategyPlanView> = {}): StrategyPlanView => ({
  state: "calculated",
  computeId: 1,
  result: result(),
  error: null,
  errorField: null,
  edit: null,
  accepted: null,
  ...patch,
});

describe("the difference with the accepted plan", () => {
  it("is the proposal minus the accepted plan: positive is slower", () => {
    expect(differenceText({ same: false, deltaSeconds: 2 })).toBe(
      "2,0 s más lenta",
    );
    expect(differenceText({ same: false, deltaSeconds: -1.5 })).toBe(
      "1,5 s más rápida",
    );
    expect(differenceText({ same: false, deltaSeconds: 0 })).toBe(
      "misma duración",
    );
    expect(differenceText(null)).toBe("");
  });

  it("says a minute and its seconds, never a decimal of them", () => {
    expect(secondsText(59.96)).toBe("1 min");
    expect(secondsText(75)).toBe("1 min 15 s");
    expect(secondsText(120)).toBe("2 min");
    expect(secondsText(-3)).toBe("3,0 s");
  });

  it("goes to the note of the Duración figure, and says nothing when equal", () => {
    expect(durationNote({ same: false, deltaSeconds: 2 })).toBe(
      "2,0 s más que tu plan aceptado",
    );
    expect(durationNote({ same: false, deltaSeconds: -2 })).toBe(
      "2,0 s menos que tu plan aceptado",
    );
    expect(durationNote({ same: true, deltaSeconds: 0 })).toBeUndefined();
    expect(durationNote(null)).toBeUndefined();
  });
});

describe("when the plan was accepted", () => {
  it("is written in the time zone given, as the host sends it in UTC", () => {
    expect(acceptedDay("2026-11-19T18:42:00Z", "Europe/Madrid")).toBe(
      "19 nov 2026",
    );
    expect(acceptedOn("2026-11-19T18:42:00Z", "Europe/Madrid")).toBe(
      "Aceptado el 19 nov 2026 a las 19:42.",
    );
    // near midnight the day follows the zone
    expect(acceptedOn("2026-11-19T23:30:00Z", "Europe/Madrid")).toBe(
      "Aceptado el 20 nov 2026 a las 00:30.",
    );
  });
});

describe("the data that changed", () => {
  it.each([
    ["basePaceSeconds", "90.472", "1:30,472"],
    ["fuelPerLapLiters", "1.83", "1,83 L"],
    ["fuelPerLapLiters", "1.850", "1,85 L"],
    ["raceLaps", "236", "236 vueltas"],
    ["reserveLaps", "0.8", "0,8 v"],
    ["refuelRate", "4", "4 L/s"],
    ["veRate", "2.5", "2,5 %/s"],
    ["serviceMode", "parallel", "todo a la vez"],
    ["track", "Fuji Speedway", "Fuji Speedway"],
    ["driverName", "", "—"],
  ] as const)("writes %s «%s» as «%s»", (field, text, spelled) => {
    expect(changeValue(field, text).toLowerCase()).toBe(spelled.toLowerCase());
  });

  it("names every field with the words of the form", () => {
    expect(changeLabel("basePaceSeconds")).toBe("Ritmo por vuelta");
    expect(changeLabel("fuelPerLapLiters")).toBe("Consumo por vuelta");
    expect(changeLabel("team")).toBe("Equipo");
    expect(changeLabel("variantMode")).toBe("Tipo de estrategia");
  });

  it("is one line per change, with the old value and the new one", () => {
    const change: StrategyChange = {
      field: "basePaceSeconds",
      before: "90.472",
      after: "90.9",
    };
    expect(changeLine(change)).toBe("Ritmo por vuelta: 1:30,472 → 1:30,900");
    // a text over the limit comes without its value: it is said, not guessed
    expect(changeLine({ field: "track", before: null, after: null })).toBe(
      "Circuito: ha cambiado (texto largo)",
    );
    expect(changeLine({ field: "track", before: "A", after: null })).toBe(
      "Circuito: ha cambiado (texto largo)",
    );
  });
});

describe("why a plan does not reach the finish", () => {
  it("says the cause in plain words, and no lap while the host sends none", () => {
    expect(unreachableText({ cause: "resourceExhausted", failLap: null })).toBe(
      "Se quedaría sin combustible, energía o neumáticos antes de llegar a meta.",
    );
    expect(unreachableText({ cause: "reserveNotMet", failLap: null })).toBe(
      "Llegaría a meta sin la reserva que pides.",
    );
    expect(unreachableText({ cause: "scheduleMismatch", failLap: null })).toBe(
      "El plan ya no cubre las vueltas de la carrera.",
    );
    expect(unreachableText({ cause: "other", failLap: null })).toBe(
      "No hemos podido comprobar si llega a meta con los datos nuevos.",
    );
  });

  it("is ready to say the lap when the solver reports it, and never invents one", () => {
    expect(unreachableText({ cause: "resourceExhausted", failLap: 170 })).toBe(
      "Se quedaría sin combustible, energía o neumáticos en la vuelta 170.",
    );
    for (const cause of ["reserveNotMet", "scheduleMismatch", "other"] as const)
      expect(unreachableText({ cause, failLap: 170 })).not.toMatch(/170/);
    for (const cause of [
      "resourceExhausted",
      "reserveNotMet",
      "scheduleMismatch",
      "other",
    ] as const)
      expect(unreachableText({ cause, failLap: null })).not.toMatch(/\d/);
  });
});

describe("the tag of the state", () => {
  it("is green when accepted, amber when outdated and red when it does not arrive", () => {
    expect(acceptedTag(accepted())).toEqual({ tone: "ok", text: "Aceptado" });
    expect(acceptedTag(accepted({ state: "stale" }))).toEqual({
      tone: "warn",
      text: "Desactualizado",
    });
    expect(acceptedTag(accepted({ state: "staleUnreachable" }))).toEqual({
      tone: "error",
      text: "No llega a meta",
    });
  });
});

describe("what can be accepted", () => {
  it("is a calculated or unproven plan with a calendar, and nothing else", () => {
    expect(canAccept(plan())).toBe(true);
    expect(
      canAccept(
        plan({
          state: "partial",
          result: result({ certificate: "not_proven" }),
        }),
      ),
    ).toBe(true);
    for (const state of ["edited", "calculating", "pendingChanges"] as const)
      expect(canAccept(plan({ state })), state).toBe(false);
    expect(canAccept(plan({ result: null }))).toBe(false);
    expect(canAccept(plan({ result: result({ timeline: null }) }))).toBe(false);
    expect(
      canAccept(
        plan({
          result: result({ certificate: "no_solution", metrics: null }),
        }),
      ),
    ).toBe(false);
  });

  it("is not offered when the proposal is the plan already accepted", () => {
    const same = plan({
      accepted: accepted({ compare: { same: true, deltaSeconds: 0 } }),
    });
    expect(isAcceptedOnView(same)).toBe(true);
    expect(canAccept(same)).toBe(false);
    const other = plan({
      accepted: accepted({ compare: { same: false, deltaSeconds: 2 } }),
    });
    expect(differsFromAccepted(other)).toBe(true);
    expect(canAccept(other)).toBe(true);
  });

  it("is clean only when it is proven with the step asked for", () => {
    expect(isCleanProposal(plan())).toBe(true);
    expect(isCleanProposal(plan({ result: result({ degraded: true }) }))).toBe(
      false,
    );
    expect(
      isCleanProposal(
        plan({
          state: "partial",
          result: result({ certificate: "not_proven" }),
        }),
      ),
    ).toBe(false);
  });

  it("knows the accepted plan is the only one on view when there is no proposal", () => {
    expect(
      isAcceptedOnly(
        plan({ state: "uncalculated", result: null, accepted: accepted() }),
      ),
    ).toBe(true);
    expect(
      isAcceptedOnly(
        plan({ state: "pendingChanges", result: null, accepted: accepted() }),
      ),
    ).toBe(true);
    expect(isAcceptedOnly(plan({ accepted: accepted() }))).toBe(false);
    expect(isAcceptedOnly(plan({ state: "uncalculated", result: null }))).toBe(
      false,
    );
  });
});

describe("the card of the Carrera tab", () => {
  it("offers to accept only a proven proposal with no plan accepted", () => {
    const card = planCard(plan());
    expect(card).toMatchObject({
      tag: { tone: "neutral", text: "Propuesta" },
      title: "Calculado · 6:01:04 · 5 paradas",
      certificate: "Comprobado: es el plan más rápido con estos datos.",
      accept: true,
      notes: [
        {
          tone: "info",
          text: "Es una propuesta: no se guarda en el archivo hasta que la aceptes.",
        },
      ],
    });
  });

  it("does not offer it when the plan has no guarantee or another plan is accepted", () => {
    expect(
      planCard(
        plan({
          state: "partial",
          result: result({
            certificate: "not_proven",
            reason: "searchBudgetExhausted",
          }),
        }),
      )?.accept,
    ).toBe(false);
    const other = planCard(
      plan({
        accepted: accepted({ compare: { same: false, deltaSeconds: 2 } }),
      }),
    );
    expect(other?.accept).toBe(false);
    expect(other?.notes).toEqual([
      {
        tone: "warn",
        text: "Es distinta de tu plan aceptado: 2,0 s más lenta.",
      },
    ]);
  });

  it("says the plan is accepted, outdated, or does not reach the finish", () => {
    const only = (patch: Partial<StrategyAcceptedView>) =>
      plan({
        state: "uncalculated",
        result: null,
        accepted: accepted(patch),
      });
    expect(planCard(only({}))).toMatchObject({
      tag: { text: "Aceptado" },
      title: "6:01:04 · 5 paradas",
      certificate: "Comprobado: es el plan más rápido con estos datos.",
      accept: false,
    });
    const stale = planCard(
      only({
        state: "stale",
        changes: [
          { field: "basePaceSeconds", before: "90.472", after: "90.9" },
        ],
      }),
    );
    expect(stale).toMatchObject({
      tag: { text: "Desactualizado" },
      title: "Aceptado · 6:01:04 · 5 paradas",
      certificate: "Has cambiado «Ritmo por vuelta»: 1:30,472 → 1:30,900.",
    });
    expect(stale?.notes[0].text).toContain("sigue llegando a meta");
    const unreachable = planCard(
      only({
        state: "staleUnreachable",
        changes: [
          { field: "fuelPerLapLiters", before: "1.83", after: "1.85" },
          { field: "reserveLaps", before: "0.8", after: "1" },
        ],
        unreachable: { cause: "resourceExhausted", failLap: null },
      }),
    );
    expect(unreachable).toMatchObject({
      tag: { text: "No llega a meta" },
      certificate: "Has cambiado 2 datos desde que aceptaste el plan.",
    });
    expect(unreachable?.notes[0].text).toBe(
      "Se quedaría sin combustible, energía o neumáticos antes de llegar a meta. Calcula de nuevo y acepta la nueva propuesta.",
    );
  });

  it("says that a plan being adjusted cannot be accepted yet", () => {
    expect(planCard(plan({ state: "edited" }))).toMatchObject({
      title: "Plan modificado · pendiente de recalcular",
      accept: false,
      notes: [{ tone: "warn", text: "Recalcula para poder aceptar el plan." }],
    });
  });
});
