import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { CurationUploadSnapshot } from "../settings/curation-upload-client";
import { CURATION_CONSENT_TEXT_VERSION, CurationPrivacySection } from "./CurationPrivacySection";

afterEach(cleanup);

function snapshot(overrides: Partial<CurationUploadSnapshot> = {}): CurationUploadSnapshot {
  return {
    consent: { textVersion: "", acceptedAt: "0001-01-01T00:00:00Z", active: false },
    paused: false,
    enabled: false,
    queue: [],
    deletions: [],
    ...overrides,
  };
}

function clientOf(value: CurationUploadSnapshot) {
  return {
    snapshot: vi.fn(async () => value),
    optIn: vi.fn(async () => ({ ...value, consent: { textVersion: CURATION_CONSENT_TEXT_VERSION, acceptedAt: "2026-08-22T10:00:00Z", active: true } })),
    pause: vi.fn(async () => ({ ...value, paused: true })),
    resume: vi.fn(async () => ({ ...value, paused: false })),
    revoke: vi.fn(async () => ({ ...value, consent: { ...value.consent, active: false } })),
    dispatch: vi.fn(async () => value),
    deleteRemote: vi.fn(async () => value),
  };
}

function mount(client: ReturnType<typeof clientOf>) {
  render(<I18nProvider><CurationPrivacySection client={client} /></I18nProvider>);
}

describe("CurationPrivacySection", () => {
  it("explica honestamente lo compartido, lo excluido y que la build está apagada", async () => {
    mount(clientOf(snapshot()));
    expect(await screen.findByText("Consentimiento de contribución")).toBeTruthy();
    expect(screen.getByText("Telemetría cruda ni archivos de sesión.")).toBeTruthy();
    expect(screen.getByText(/seudonimizados, no anónimos/)).toBeTruthy();
    expect(screen.getByText(/subidas están apagadas/)).toBeTruthy();
  });

  it("registra la versión exacta del texto al aceptar", async () => {
    const client = clientOf(snapshot());
    mount(client);
    fireEvent.click(await screen.findByRole("button", { name: "Aceptar y participar" }));
    await waitFor(() => expect(client.optIn).toHaveBeenCalledWith(CURATION_CONSENT_TEXT_VERSION));
  });

  it("muestra cola inspeccionable y mantiene pausa, revocación y borrado como acciones separadas", async () => {
    const active = snapshot({
      consent: { textVersion: CURATION_CONSENT_TEXT_VERSION, acceptedAt: "2026-08-22T10:00:00Z", active: true },
      enabled: true,
      queue: [{
        id: "queue-1", createdAt: "2026-08-22T10:00:00Z", updatedAt: "2026-08-22T10:00:00Z",
        state: "pending", attempts: 0,
        bundle: { admin: { uploadId: "install-1", deleteHash: "hash" }, payload: { combinationId: "lmu:spa:lmp2", epoch: "2026-W34" } },
      }],
      deletions: [],
    });
    mount(clientOf(active));
    expect(await screen.findByRole("button", { name: "Pausar cola" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revocar consentimiento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Solicitar borrado remoto" })).toBeTruthy();
    fireEvent.click(screen.getByText("Ver paquete exacto"));
    expect(screen.getByText(/"epoch": "2026-W34"/)).toBeTruthy();
  });
});
