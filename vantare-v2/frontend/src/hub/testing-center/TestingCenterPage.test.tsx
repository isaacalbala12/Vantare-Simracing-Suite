import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestingCenterPage } from "./TestingCenterPage";
import type { ReportDraft, SubmittedReport } from "./contracts";
import type { TestingCenterClient } from "./testing-center-client";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

function client(overrides: Partial<TestingCenterClient> = {}): TestingCenterClient {
  const draft: ReportDraft = {
    schemaVersion: 1,
    idempotencyKey: `draft_${"b".repeat(64)}`,
    actionText: "opened launcher",
    expectedText: "profile starts",
    observedText: "nothing happens",
    contextText: "",
    module: "launcher",
  };
  return {
    loadDraft: vi.fn().mockResolvedValue(draft),
    saveDraft: vi.fn().mockResolvedValue(draft),
    discardDraft: vi.fn().mockResolvedValue(undefined),
    prepareDiagnostic: vi.fn().mockResolvedValue({
      preview: { contractVersion: "testing-center.diagnostic.v1", payload: "{}", sha256: "a".repeat(64), byteSize: 2 },
      environment: {
        appVersion: "v0.1.0.5", osFamily: "windows", osVersion: "Windows", arch: "amd64",
        availableLogCount: 0, channel: "nightly",
      },
    }),
    ...overrides,
  };
}

describe("TestingCenterPage", () => {
  it("restores only text fields while keeping both consents off", async () => {
    render(<TestingCenterPage channel="nightly" version="v0.1.0.5" client={client()} submitReport={vi.fn()} />);
    expect(await screen.findByDisplayValue("opened launcher")).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(false);
    expect(checkboxes[1].disabled).toBe(true);
  });

  it("blocks network submission offline but preserves the form", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const submitReport = vi.fn();
    render(<TestingCenterPage channel="testers" version="v0.1.0.5" client={client()} submitReport={submitReport} />);
    expect(await screen.findByDisplayValue("opened launcher")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Enviar reporte" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(/borrador se conserva localmente/i)).toBeTruthy();
    expect(submitReport).not.toHaveBeenCalled();
  });

  it("uses the stable backend key and clears the draft only after success", async () => {
    const testingClient = client();
    const result: SubmittedReport = {
      reportId: `report_${"c".repeat(64)}`,
      reportState: "submitted",
      idempotent: false,
      createdAt: "2026-08-02T20:00:00Z",
    };
    const submitReport = vi.fn().mockResolvedValue(result);
    render(<TestingCenterPage channel="nightly" version="v0.1.0.5" client={testingClient} submitReport={submitReport} />);
    expect(await screen.findByDisplayValue("opened launcher")).toBeTruthy();
    fireEvent.submit(screen.getByRole("button", { name: "Enviar reporte" }).closest("form")!);
    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    expect(submitReport.mock.calls[0][0].idempotencyKey).toBe(`draft_${"b".repeat(64)}`);
    await waitFor(() => expect(testingClient.discardDraft).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(result.reportId)).toBeTruthy();
  });

  it("keeps the same draft available after a failed submission", async () => {
    const testingClient = client();
    const submitReport = vi.fn().mockRejectedValue(new Error("network"));
    render(<TestingCenterPage channel="nightly" version="v0.1.0.5" client={testingClient} submitReport={submitReport} />);
    expect(await screen.findByDisplayValue("opened launcher")).toBeTruthy();
    fireEvent.submit(screen.getByRole("button", { name: "Enviar reporte" }).closest("form")!);
    expect(await screen.findByText(/borrador sigue guardado/i)).toBeTruthy();
    expect(testingClient.discardDraft).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("opened launcher")).toBeTruthy();
  });

  it("rejects diagnostics prepared for a different build channel", async () => {
    const submitReport = vi.fn();
    const testingClient = client({
      prepareDiagnostic: vi.fn().mockResolvedValue({
        preview: {
          contractVersion: "testing-center.diagnostic.v1", payload: "{}",
          sha256: "a".repeat(64), byteSize: 2,
        },
        environment: {
          appVersion: "v0.1.0.5", osFamily: "windows", osVersion: "Windows",
          arch: "amd64", availableLogCount: 0, channel: "testers",
        },
      }),
    });
    render(<TestingCenterPage channel="nightly" version="v0.1.0.5" client={testingClient} submitReport={submitReport} />);
    expect(await screen.findByDisplayValue("opened launcher")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(await screen.findByText(/no se pudo preparar un diagnóstico válido/i)).toBeTruthy();
    fireEvent.submit(screen.getByRole("button", { name: "Enviar reporte" }).closest("form")!);
    expect(submitReport).not.toHaveBeenCalled();
  });

  it("locks editable controls while a report is in flight", async () => {
    let resolveSubmission: ((value: SubmittedReport) => void) | undefined;
    const submitReport = vi.fn().mockImplementation(() => new Promise<SubmittedReport>((resolve) => {
      resolveSubmission = resolve;
    }));
    render(<TestingCenterPage channel="nightly" version="v0.1.0.5" client={client()} submitReport={submitReport} />);
    const action = await screen.findByDisplayValue("opened launcher") as HTMLTextAreaElement;
    fireEvent.submit(screen.getByRole("button", { name: "Enviar reporte" }).closest("form")!);
    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    expect(action.disabled).toBe(true);
    resolveSubmission?.({
      reportId: `report_${"e".repeat(64)}`,
      reportState: "submitted",
      idempotent: false,
      createdAt: "2026-08-02T20:00:00Z",
    });
    expect(await screen.findByText(`report_${"e".repeat(64)}`)).toBeTruthy();
  });
});
