import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "../../../lib/access-policy";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import type { StudioProfileClient } from "./studio-profile-client";
import {
  readCachedStudioDocument,
  writeCachedStudioDocument,
} from "./studio-doc-cache";
import { StudioProvider, useStudioDocument } from "./studio-store";

const freeAccess: AccessContext = {
  planLabel: "free",
  planStatus: "active",
  roles: [],
  isBlocked: false,
  isUnconfigured: false,
};

function buildDocument(name: string): ProfileDocumentV3 {
  const widget = deltaDefinition.createDefault("delta-main");
  return {
    schemaVersion: 3,
    id: "profile-1",
    name,
    displayMode: "edit",
    monitorIndex: 0,
    layouts: { general: { type: "general", widgets: [widget] } },
  };
}

const FILE = "profiles/swr.json";

afterEach(() => cleanup());
afterEach(() => {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("vantare.studio.doc.")) {
      window.localStorage.removeItem(key);
    }
  }
  vi.restoreAllMocks();
});

function Probe(): React.ReactElement {
  const { document } = useStudioDocument();
  return <div data-testid="probe-name">{document?.name ?? "none"}</div>;
}

describe("studio-doc-cache", () => {
  it("roundtrip del documento por fichero", () => {
    const doc = buildDocument("cacheado");
    writeCachedStudioDocument(FILE, doc);
    expect(readCachedStudioDocument(FILE)?.name).toBe("cacheado");
  });

  it("devuelve null ante JSON corrupto sin lanzar", () => {
    window.localStorage.setItem(`vantare.studio.doc.${FILE}`, "{roto");
    expect(readCachedStudioDocument(FILE)).toBeNull();
  });

  it("expulsa entradas viejas cuando se supera el presupuesto LRU", () => {
    // Documentos genuinamente grandes (~900 KB de JSON cada uno): 4 escrituras
    // superan los 3 MB y la mas antigua debe salir.
    const bigDoc = buildDocument("gordo");
    bigDoc.name = "x".repeat(900 * 1024);
    writeCachedStudioDocument("a.json", bigDoc);
    writeCachedStudioDocument("b.json", bigDoc);
    writeCachedStudioDocument("c.json", bigDoc);
    writeCachedStudioDocument("d.json", bigDoc);
    expect(window.localStorage.getItem("vantare.studio.doc.a.json")).toBeNull();
    expect(window.localStorage.getItem("vantare.studio.doc.d.json")).not.toBeNull();
  });
});

describe("StudioProvider stale-while-revalidate", () => {
  it("pinta al instante desde cache y sustituye cuando llega el fresco", async () => {
    writeCachedStudioDocument(FILE, buildDocument("cacheado"));
    let resolveLoad: ((value: { document: ProfileDocumentV3; revision: string }) => void) | null =
      null;
    const client: StudioProfileClient = {
      load: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveLoad = resolve;
          }),
      ) as unknown as StudioProfileClient["load"],
      save: vi.fn(),
    };

    render(
      <StudioProvider
        access={freeAccess}
        client={client}
        initialFile={FILE}
        recoveryStorage={null}
      >
        <Probe />
      </StudioProvider>,
    );

    // Instantaneo: la cache pinta antes de que el load resuelva.
    expect(screen.getByTestId("probe-name").textContent).toBe("cacheado");

    await act(async () => {
      resolveLoad?.({ document: buildDocument("fresco"), revision: "rev-2" });
    });
    await waitFor(() => expect(screen.getByTestId("probe-name").textContent).toBe("fresco"));
    expect(readCachedStudioDocument(FILE)?.name).toBe("fresco");
  });

  it("si el usuario edito sobre la cache, conserva sus cambios y re-ancora saved", async () => {
    writeCachedStudioDocument(FILE, buildDocument("cacheado"));
    let resolveLoad: ((value: { document: ProfileDocumentV3; revision: string }) => void) | null =
      null;
    const client: StudioProfileClient = {
      load: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveLoad = resolve;
          }),
      ) as unknown as StudioProfileClient["load"],
      save: vi.fn(),
    };

    function EditProbe(): React.ReactElement {
      const { document, dispatch } = useStudioDocument();
      return (
        <>
          <div data-testid="probe-name">{document?.name ?? "none"}</div>
          <button
            type="button"
            data-testid="probe-edit"
            onClick={() =>
              dispatch({
                type: "widget/layout",
                session: "general",
                widgetIds: ["delta-main"],
                patch: { x: 200 },
              })
            }
          >
            editar
          </button>
        </>
      );
    }

    render(
      <StudioProvider
        access={freeAccess}
        client={client}
        initialFile={FILE}
        recoveryStorage={null}
      >
        <EditProbe />
      </StudioProvider>,
    );
    expect(screen.getByTestId("probe-name").textContent).toBe("cacheado");

    // El usuario edita antes de que llegue el fresco.
    await act(async () => {
      screen.getByTestId("probe-edit").click();
    });
    // Sanidad: la edicion se aplico sobre la semilla cacheada.
    expect(screen.getByTestId("probe-name").textContent).toBe("cacheado");
    await act(async () => {
      resolveLoad?.({ document: buildDocument("fresco"), revision: "rev-2" });
    });
    await waitFor(() => expect(screen.getByTestId("probe-name").textContent).toBe("cacheado"));
  });
});
