import { describe, expect, it } from "vitest";

import {
  createSanitizedException,
  sanitizeCapturePayload,
  sanitizeUrl,
} from "./privacy";

describe("PostHog spike privacy boundary", () => {
  it("removes query strings and fragments from URLs", () => {
    expect(
      sanitizeUrl(
        "http://127.0.0.1:5186/posthog-wails-spike-harness.html?token=SYNTHETIC_QUERY_SECRET#private",
      ),
    ).toBe(
      "http://127.0.0.1:5186/posthog-wails-spike-harness.html",
    );
  });

  it("redacts sensitive keys recursively while preserving technical context", () => {
    expect(
      sanitizeCapturePayload({
        event: "synthetic_error_triggered",
        properties: {
          app_version: "0.1.0.2",
          operating_system: "Windows",
          $browser_name: "Microsoft Edge",
          $distinct_id: "synthetic-anonymous-id",
          token: "phc_public_project_token",
          email: "tester@example.invalid",
          authToken: "SYNTHETIC_TOKEN_SECRET",
          nested: {
            password: "SYNTHETIC_PASSWORD_SECRET",
            renderer: "WebView2",
          },
          $current_url:
            "http://127.0.0.1:5186/harness?token=SYNTHETIC_QUERY_SECRET#private",
        },
      }),
    ).toEqual({
      event: "synthetic_error_triggered",
      properties: {
        app_version: "0.1.0.2",
        operating_system: "Windows",
        $browser_name: "Microsoft Edge",
        $distinct_id: "synthetic-anonymous-id",
        token: "phc_public_project_token",
        email: "[REDACTED]",
        authToken: "[REDACTED]",
        nested: {
          password: "[REDACTED]",
          renderer: "WebView2",
        },
        $current_url: "http://127.0.0.1:5186/harness",
      },
    });
  });

  it("replaces raw exception text and keeps only allowlisted stack locations", () => {
    const source = new Error(
      "Failure for tester@example.invalid with SYNTHETIC_EXCEPTION_SECRET",
    );
    source.stack = [
      "Error: Failure for tester@example.invalid with SYNTHETIC_EXCEPTION_SECRET",
      "    at leak (http://127.0.0.1:5186/src/private/file.ts?token=SYNTHETIC_QUERY_SECRET:42:7)",
      "    at local (C:\\Users\\private-user\\secret-file.ts:5:1)",
    ].join("\n");

    const sanitized = createSanitizedException(source);
    const serialized = `${sanitized.name}\n${sanitized.message}\n${sanitized.stack}`;

    expect(sanitized.name).toBe("Error");
    expect(sanitized.message).toBe("Vantare frontend exception");
    expect(sanitized.stack).toContain("file.ts:42:7");
    expect(sanitized.stack).toContain("secret-file.ts:5:1");
    expect(serialized).not.toContain("tester@example.invalid");
    expect(serialized).not.toContain("SYNTHETIC_EXCEPTION_SECRET");
    expect(serialized).not.toContain("private-user");
    expect(serialized).not.toContain("SYNTHETIC_QUERY_SECRET");
  });
});
