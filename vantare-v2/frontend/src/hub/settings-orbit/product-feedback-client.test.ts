import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSupabaseClient: vi.fn(),
}));

vi.mock("../../lib/supabase-auth", () => mock);

import {
  deleteProductFeedback,
  listProductFeedback,
  prepareProductFeedback,
  submitProductFeedback,
} from "./product-feedback-client";

const input = {
  category: "idea" as const,
  message: "  Una idea muy concreta para mis sesiones  ",
  appVersion: "1.2.3",
  channel: "stable" as const,
  replyOptIn: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  mock.getSession.mockResolvedValue({ access_token: "session" });
});

describe("opinión explícita", () => {
  it("prepara solo los campos mostrados y valida el texto antes de red", async () => {
    expect(prepareProductFeedback(input)).toEqual({ ...input, message: "Una idea muy concreta para mis sesiones" });
    expect(() => prepareProductFeedback({ ...input, message: " breve " })).toThrow("invalid_message");
    expect(mock.getSession).not.toHaveBeenCalled();
  });

  it("exige sesión y no intenta insertar como anónimo", async () => {
    mock.getSession.mockResolvedValue(null);
    await expect(submitProductFeedback(input)).rejects.toThrow("sign_in_required");
    expect(mock.getSupabaseClient).not.toHaveBeenCalled();
  });

  it("envía exactamente los campos previsualizados", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mock.getSupabaseClient.mockReturnValue({ from: vi.fn().mockReturnValue({ insert }) });
    await submitProductFeedback(input);
    expect(insert).toHaveBeenCalledWith({
      category: "idea",
      message: "Una idea muy concreta para mis sesiones",
      app_version: "1.2.3",
      channel: "stable",
      reply_opt_in: false,
    });
  });

  it("no declara borrado si RLS no devolvió la fila propia", async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ select });
    mock.getSupabaseClient.mockReturnValue({ from: vi.fn().mockReturnValue({ delete: () => ({ eq }) }) });
    await expect(deleteProductFeedback("3455a98c-0fb9-4a0d-8020-4df44c92c88b")).rejects.toThrow("unavailable");
  });

  it("lista solo las columnas de la persona y preserva páginas", async () => {
    const row = {
      id: "3455a98c-0fb9-4a0d-8020-4df44c92c88b", category: "idea", message: "Mi idea",
      app_version: null, channel: "unknown", reply_opt_in: false, triage_status: "new",
      created_at: "2026-09-23T10:00:00Z", expires_at: "2027-03-22T10:00:00Z",
    };
    const range = vi.fn().mockResolvedValue({ data: [row], error: null });
    const order = vi.fn().mockReturnValue({ range });
    const select = vi.fn().mockReturnValue({ order });
    mock.getSupabaseClient.mockReturnValue({ from: vi.fn().mockReturnValue({ select }) });
    const result = await listProductFeedback(2);
    expect(range).toHaveBeenCalledWith(40, 60);
    expect(result.entries[0]).toMatchObject({ category: "idea", status: "new", replyOptIn: false });
    expect(result.hasMore).toBe(false);
  });
});
