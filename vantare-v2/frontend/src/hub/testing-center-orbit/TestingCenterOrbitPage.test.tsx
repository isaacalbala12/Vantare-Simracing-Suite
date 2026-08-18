import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LicenseProvider } from "../../lib/license";
import { LauncherStoreProvider } from "../launcher/launcher-store";
import { OrbitShell } from "../components/orbit/OrbitShell";
import type { ReportDraft, ReportDraftFields, SubmittedReport } from "../testing-center/contracts";
import type { TestingCenterClient } from "../testing-center/testing-center-client";
import { TestingCenterOrbitPage } from "./TestingCenterOrbitPage";

function draftOf(fields: ReportDraftFields): ReportDraft {
  return { ...fields, schemaVersion: 1, idempotencyKey: "key-1" };
}

function stubClient(overrides: Partial<TestingCenterClient> = {}) {
  const saveDraft = vi.fn(async (fields: ReportDraftFields) => draftOf(fields));
  const discardDraft = vi.fn(async () => undefined);
  const loadDraft = vi.fn(async () => null);
  return {
    client: {
      loadDraft,
      saveDraft,
      discardDraft,
      prepareDiagnostic: vi.fn(async () => {
        throw new Error("no debería pedirse sin consentimiento");
      }),
      ...overrides,
    } as unknown as TestingCenterClient,
    saveDraft,
    discardDraft,
    loadDraft,
  };
}

function mount(client: TestingCenterClient, submitReport = vi.fn(async () => submitted)) {
  const view = render(
    <LicenseProvider>
      <I18nProvider>
        <TestingCenterOrbitPage channel="nightly" client={client} submitReport={submitReport} version="v0.3.10" />
      </I18nProvider>
    </LicenseProvider>,
  );
  return { ...view, submitReport };
}

const submitted: SubmittedReport = {
  reportId: "rep_123",
  reportState: "submitted",
} as SubmittedReport;

function fill() {
  for (const id of ["orbit-tc-action", "orbit-tc-expected", "orbit-tc-observed"]) {
    fireEvent.change(document.getElementById(id) as HTMLTextAreaElement, {
      target: { value: "texto suficiente" },
    });
  }
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TestingCenterOrbitPage", () => {
  it("no valida hasta enviar y entonces marca los tres obligatorios", async () => {
    const { client } = stubClient();
    const { submitReport } = mount(client);
    await screen.findByTestId("orbit-testing");

    fireEvent.submit(document.getElementById("orbit-testing-form") as HTMLFormElement);

    await waitFor(() => {
      expect(document.querySelectorAll(".orbit-tc__error")).toHaveLength(3);
    });
    expect(submitReport).not.toHaveBeenCalled();
  });

  it("con los obligatorios rellenos el envío usa el flujo real", async () => {
    const { client, saveDraft, discardDraft } = stubClient();
    const { submitReport } = mount(client);
    await screen.findByTestId("orbit-testing");

    fill();
    fireEvent.submit(document.getElementById("orbit-testing-form") as HTMLFormElement);

    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    const input = submitReport.mock.calls[0][0] as { channel: string; idempotencyKey: string };
    expect(input.channel).toBe("nightly");
    expect(input.idempotencyKey).toBe("key-1");
    // El borrador se guarda antes de enviar y se borra después: el mismo
    // contrato que la pantalla v5.2.
    expect(saveDraft).toHaveBeenCalled();
    await waitFor(() => expect(discardDraft).toHaveBeenCalled());
    expect(await screen.findByTestId("orbit-testing-sent")).toBeTruthy();
  });

  it("descartar borra el borrador real y vacía el formulario", async () => {
    const seeded: ReportDraftFields = {
      actionText: "abrí el launcher",
      expectedText: "que arrancara",
      observedText: "no arrancó",
      contextText: "",
      module: "launcher",
    };
    const { client, discardDraft } = stubClient({
      loadDraft: vi.fn(async () => draftOf(seeded)),
    });
    mount(client);

    await waitFor(() => {
      expect((document.getElementById("orbit-tc-action") as HTMLTextAreaElement).value).toBe(
        seeded.actionText,
      );
    });

    fireEvent.click(screen.getByTestId("orbit-testing-discard"));

    await waitFor(() => expect(discardDraft).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect((document.getElementById("orbit-tc-action") as HTMLTextAreaElement).value).toBe("");
    });
  });

  it("el borrador guardado se restaura al abrir la pantalla", async () => {
    const seeded: ReportDraftFields = {
      actionText: "toqué el dial",
      expectedText: "que contara",
      observedText: "se quedó a cero",
      contextText: "solo en nightly",
      module: "telemetry",
    };
    const { client } = stubClient({ loadDraft: vi.fn(async () => draftOf(seeded)) });
    mount(client);

    await waitFor(() => {
      expect((document.getElementById("orbit-tc-context") as HTMLTextAreaElement).value).toBe(
        seeded.contextText,
      );
    });
    // El `Select` del kit es un combobox propio: el valor se lee en su etiqueta.
    expect(document.getElementById("orbit-tc-module")?.textContent).toContain("Telemetry");
  });

  it("la pantalla no usa el atributo `title` nativo", async () => {
    const { client } = stubClient();
    const { container } = mount(client);
    await screen.findByTestId("orbit-testing");
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
  });
});

describe("acceso a Testing Center desde la shell", () => {
  function mountShell(channel: "nightly" | null) {
    const onNavigate = vi.fn();
    render(
      <LicenseProvider>
        <I18nProvider>
          <LauncherStoreProvider>
            <OrbitShell
              activeSection="testing-center"
              onNavigate={onNavigate}
              testingCenterChannel={channel}
              version="v0.3.10"
            >
              <div />
            </OrbitShell>
          </LauncherStoreProvider>
        </I18nProvider>
      </LicenseProvider>,
    );
    return onNavigate;
  }

  it("con canal Stable la vista redirige a Inicio con toast y el rail no la ofrece", async () => {
    const onNavigate = mountShell(null);

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("dashboard"));
    expect(screen.getByTestId("orbit-toasts").textContent).toContain(
      "Testing Center no está disponible en Stable",
    );
    expect(screen.queryByTestId("orbit-rail-testing")).toBeNull();
    expect(screen.queryByTestId("orbit-testing")).toBeNull();
  });

  it("con canal nightly la shell monta la pantalla y el rail la ofrece", async () => {
    const onNavigate = mountShell("nightly");

    expect(await screen.findByTestId("orbit-testing")).toBeTruthy();
    expect(screen.getByTestId("orbit-rail-testing")).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
