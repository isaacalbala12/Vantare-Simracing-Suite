import { describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";

import { accountInitial, identityFromSession } from "./use-account-identity";

function session(metadata: Record<string, unknown>, email = "isaac@vantare.app"): Session {
  return { user: { email, user_metadata: metadata } } as unknown as Session;
}

describe("identityFromSession", () => {
  it("lee nombre y foto de Google (`full_name` / `avatar_url`)", () => {
    const identity = identityFromSession(
      session({ full_name: "Isaac Albalá", avatar_url: "https://lh3.googleusercontent.com/a/foto" }),
    );
    expect(identity).toEqual({
      displayName: "Isaac Albalá",
      email: "isaac@vantare.app",
      avatarUrl: "https://lh3.googleusercontent.com/a/foto",
    });
  });

  it("acepta las variantes `name` y `picture` del mismo proveedor", () => {
    const identity = identityFromSession(session({ name: "Isaac", picture: "https://foto" }));
    expect(identity.displayName).toBe("Isaac");
    expect(identity.avatarUrl).toBe("https://foto");
  });

  it("sin sesión no inventa nada, pero conserva el correo de la licencia", () => {
    expect(identityFromSession(null)).toEqual({
      displayName: null,
      email: null,
      avatarUrl: null,
    });
    expect(identityFromSession(null, "piloto@vantare.app").email).toBe("piloto@vantare.app");
  });

  it("ignora los valores en blanco del proveedor", () => {
    const identity = identityFromSession(session({ full_name: "   ", avatar_url: "" }));
    expect(identity.displayName).toBeNull();
    expect(identity.avatarUrl).toBeNull();
  });
});

describe("accountInitial", () => {
  it("usa el nombre, luego el correo, y nunca el plan", () => {
    expect(accountInitial({ displayName: "Isaac", email: "p@v.app", avatarUrl: null })).toBe("I");
    expect(accountInitial({ displayName: null, email: "piloto@v.app", avatarUrl: null })).toBe("P");
    expect(accountInitial({ displayName: null, email: null, avatarUrl: null })).toBe("·");
  });
});
