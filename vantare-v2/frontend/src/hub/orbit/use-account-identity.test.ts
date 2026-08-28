import { describe, expect, it } from "vitest";
import type { ClerkAccountUser } from "../../lib/clerk-auth";

import { accountInitial, identityFromClerkUser } from "./use-account-identity";

function user(overrides: Partial<ClerkAccountUser> = {}): ClerkAccountUser {
  return {
    fullName: "Isaac Albalá",
    username: "isaac",
    imageUrl: "https://img.clerk.com/avatar",
    primaryEmailAddress: { emailAddress: "isaac@vantare.app" },
    ...overrides,
  };
}

describe("identityFromClerkUser", () => {
  it("reads name, primary email and avatar from Clerk", () => {
    expect(identityFromClerkUser(user())).toEqual({
      displayName: "Isaac Albalá",
      email: "isaac@vantare.app",
      avatarUrl: "https://img.clerk.com/avatar",
    });
  });

  it("uses Clerk username when full name is unavailable", () => {
    expect(identityFromClerkUser(user({ fullName: null })).displayName).toBe("isaac");
  });

  it("without Clerk user preserves only the signed license email", () => {
    expect(identityFromClerkUser(null)).toEqual({
      displayName: null,
      email: null,
      avatarUrl: null,
    });
    expect(identityFromClerkUser(null, "piloto@vantare.app").email).toBe(
      "piloto@vantare.app",
    );
  });

  it("ignores blank provider values", () => {
    const identity = identityFromClerkUser(
      user({ fullName: "   ", username: "", imageUrl: "" }),
    );
    expect(identity.displayName).toBeNull();
    expect(identity.avatarUrl).toBeNull();
  });
});

describe("accountInitial", () => {
  it("uses name, then email, and never the plan", () => {
    expect(accountInitial({ displayName: "Isaac", email: "p@v.app", avatarUrl: null })).toBe("I");
    expect(accountInitial({ displayName: null, email: "piloto@v.app", avatarUrl: null })).toBe("P");
    expect(accountInitial({ displayName: null, email: null, avatarUrl: null })).toBe("·");
  });
});
