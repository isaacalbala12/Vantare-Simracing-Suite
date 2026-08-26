import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFontsReady } from "./use-fonts-ready";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubFonts(fake: { status: string; ready: Promise<unknown> } | undefined): () => void {
  const descriptor =
    Object.getOwnPropertyDescriptor(Document.prototype, "fonts") ??
    Object.getOwnPropertyDescriptor(document, "fonts");
  Object.defineProperty(document, "fonts", {
    configurable: true,
    get: () => fake,
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(document, "fonts", descriptor);
    } else {
      delete (document as unknown as { fonts?: unknown }).fonts;
    }
  };
}

function Probe(): React.ReactElement {
  const ready = useFontsReady(30);
  return <div data-testid="ready">{ready ? "si" : "no"}</div>;
}

describe("useFontsReady", () => {
  it("resuelve true via document.fonts.ready", async () => {
    const restore = stubFonts({ status: "loading", ready: Promise.resolve() });
    try {
      render(<Probe />);
      expect(screen.getByTestId("ready").textContent).toBe("no");
      await vi.waitFor(() => expect(screen.getByTestId("ready").textContent).toBe("si"));
    } finally {
      restore();
    }
  });

  it("no bloquea para siempre: timeout de seguridad", async () => {
    // Timers reales: el timeout del hook usa window.setTimeout, que los fake
    // timers de vitest no parchean en happy-dom.
    const restore = stubFonts({ status: "loading", ready: new Promise(() => undefined) });
    try {
      render(<Probe />);
      expect(screen.getByTestId("ready").textContent).toBe("no");
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(screen.getByTestId("ready").textContent).toBe("si");
    } finally {
      restore();
    }
  });

  it("sin FontFaceSet (tests/jsdom) arranca ready", () => {
    const restore = stubFonts(undefined);
    try {
      render(<Probe />);
      expect(screen.getByTestId("ready").textContent).toBe("si");
    } finally {
      restore();
    }
  });
});
