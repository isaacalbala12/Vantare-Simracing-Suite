import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/supabase-auth", () => ({
  signInWithEmail: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

import { LoginScreen } from "./LoginScreen";
import {
  signInWithEmail,
  signInWithOAuth,
} from "../../lib/supabase-auth";

describe("LoginScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("renders email and password inputs", () => {
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/contraseña/i)).toBeTruthy();
  });

  it("calls signInWithEmail with entered values and fires onLoggedIn on success", async () => {
    (signInWithEmail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { session: { access_token: "tok" } },
    );
    const onLoggedIn = vi.fn();
    render(<LoginScreen onLoggedIn={onLoggedIn} />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "u@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    expect(signInWithEmail).toHaveBeenCalledWith("u@example.com", "secret");
    await vi.waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith("tok"));
  });

  it("shows error message when signInWithEmail rejects", async () => {
    (signInWithEmail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { session: null, error: "Invalid credentials" },
    );
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "u@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    expect(await screen.findByText(/invalid credentials/i)).toBeTruthy();
  });

  it("triggers google oauth when google button is clicked", () => {
    (signInWithOAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {},
    );
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /google/i }));
    expect(signInWithOAuth).toHaveBeenCalledWith("google");
  });

  it("triggers discord oauth when discord button is clicked", () => {
    (signInWithOAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {},
    );
    render(<LoginScreen onLoggedIn={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /discord/i }));
    expect(signInWithOAuth).toHaveBeenCalledWith("discord");
  });
});