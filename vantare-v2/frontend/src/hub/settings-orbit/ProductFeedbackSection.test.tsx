import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ProductFeedbackSection } from "./ProductFeedbackSection";

const mock = vi.hoisted(() => ({
  list: vi.fn(),
  submit: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("./product-feedback-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./product-feedback-client")>();
  return {
    ...original,
    listProductFeedback: mock.list,
    submitProductFeedback: mock.submit,
    deleteProductFeedback: mock.remove,
  };
});

function mount() {
  return render(<I18nProvider><ProductFeedbackSection appVersion="1.2.3" channel="stable" /></I18nProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
  mock.list.mockResolvedValue({ entries: [], hasMore: false });
  mock.submit.mockResolvedValue(undefined);
  mock.remove.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("Opiniones en Ajustes", () => {
  it("muestra el paquete exacto y solo envía tras la segunda acción", async () => {
    mount();
    await waitFor(() => expect(mock.list).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Mensaje"), { target: { value: "Me gusta poder leer el delta de un vistazo." } });
    fireEvent.click(screen.getByTestId("orbit-settings-feedback-review"));
    const preview = screen.getByTestId("orbit-settings-feedback-preview");
    expect(preview.textContent).toContain("Me gusta poder leer el delta de un vistazo.");
    expect(preview.textContent).toContain("1.2.3");
    expect(preview.textContent).toContain("stable");
    expect(mock.submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("orbit-settings-feedback-send"));
    await waitFor(() => expect(mock.submit).toHaveBeenCalledWith({
      category: "experience",
      message: "Me gusta poder leer el delta de un vistazo.",
      appVersion: "1.2.3",
      channel: "stable",
      replyOptIn: false,
    }));
  });

  it("pide confirmar antes de eliminar un envío propio", async () => {
    mock.list.mockResolvedValue({ entries: [{
      id: "3455a98c-0fb9-4a0d-8020-4df44c92c88b", category: "idea",
      message: "Quiero cambiar el tamaño de Relative", appVersion: null,
      channel: "stable", replyOptIn: false, status: "new",
      createdAt: "2026-09-23T10:00:00Z", expiresAt: "2027-03-22T10:00:00Z",
    }], hasMore: false });
    mount();
    await screen.findByText("Quiero cambiar el tamaño de Relative");
    fireEvent.click(screen.getByText("Eliminar"));
    expect(mock.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Confirmar eliminación"));
    await waitFor(() => expect(mock.remove).toHaveBeenCalledWith("3455a98c-0fb9-4a0d-8020-4df44c92c88b"));
  });
});
