import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TestingCenterFeedbackClient } from "./candidate-feedback-client";
import { CandidateFeedbackPanel } from "./CandidateFeedbackPanel";

afterEach(cleanup);

function client(canValidate = true): TestingCenterFeedbackClient {
  return {
    listCandidates: vi.fn().mockResolvedValue([{
      issueId: `issue_${"a".repeat(64)}`,
      candidateId: "candidate-isa242",
      channel: "nightly",
      appVersion: "v0.1.0.5-nightly",
      candidateSha: "b".repeat(40),
      module: "testing_center",
      summary: "The report form remains open",
      criteria: ["The draft remains visible"],
      knownFailure: "The draft used to disappear",
      state: "pending",
      canValidate,
    }]),
    submitFeedback: vi.fn().mockImplementation(async (input) => ({
      validationId: `validation_${"c".repeat(64)}`,
      decision: input.decision,
      flowState: input.decision === "rejected" ? "needs_owner" : "nightly_accepted",
      candidateState: input.decision === "rejected" ? "rejected" : "accepted",
      idempotent: false,
    })),
  };
}

describe("CandidateFeedbackPanel", () => {
  it("shows sanitized candidate context and records acceptance", async () => {
    const testingClient = client();
    render(<CandidateFeedbackPanel channel="nightly" client={testingClient} />);
    expect(await screen.findByText("The report form remains open")).toBeTruthy();
    expect(screen.getByText("The draft used to disappear")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Funciona" }));
    await waitFor(() => expect(testingClient.submitFeedback).toHaveBeenCalledWith({
      candidateId: "candidate-isa242",
      candidateSha: "b".repeat(40),
      decision: "accepted",
    }));
    expect(await screen.findByText("Corrección aceptada")).toBeTruthy();
  });

  it("preserves an incomplete rejection and submits complete structured feedback", async () => {
    const testingClient = client();
    render(<CandidateFeedbackPanel channel="nightly" client={testingClient} />);
    await screen.findByText("The report form remains open");
    fireEvent.click(screen.getByRole("button", { name: "Necesita cambios" }));
    const description = screen.getByLabelText("Descripción breve");
    fireEvent.change(description, { target: { value: "Still closes" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar cambios solicitados" }));
    expect(await screen.findByText(/Completa los cuatro campos/i)).toBeTruthy();
    expect((description as HTMLTextAreaElement).value).toBe("Still closes");

    fireEvent.change(screen.getByLabelText("Pasos para reproducirlo"), { target: { value: "Open and return" } });
    fireEvent.change(screen.getByLabelText("Resultado esperado"), { target: { value: "Draft remains" } });
    fireEvent.change(screen.getByLabelText("Resultado observado"), { target: { value: "Draft closes" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar cambios solicitados" }));
    await waitFor(() => expect(testingClient.submitFeedback).toHaveBeenCalledWith(expect.objectContaining({
      decision: "rejected",
      details: expect.objectContaining({
        description: "Still closes",
        diagnosticsConsent: false,
        logsConsent: false,
      }),
    })));
    expect(await screen.findByText("Cambios solicitados")).toBeTruthy();
  });

  it("keeps validation controls disabled when the server denies the action", async () => {
    render(<CandidateFeedbackPanel channel="nightly" client={client(false)} />);
    const accept = await screen.findByRole("button", { name: "Funciona" }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    expect(screen.getByText(/no validarla con esta cuenta/i)).toBeTruthy();
  });
});
