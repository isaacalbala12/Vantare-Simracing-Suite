import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../../i18n/I18nProvider";
import type { ProfileDocumentV3 } from "../../../overlay/core/profile-document";
import { deltaDefinition } from "../../../overlay/widget-types/delta/delta-definition";
import { installHubSuspendGuard } from "../../hub-suspend-guard";
import { LayoutSection } from "./LayoutSection";

afterEach(() => cleanup());

describe("LayoutSection suspend blocker", () => {
  it("publica el borrador al escribir sin esperar al blur", () => {
    const snapshots: Array<{ other?: string[] }> = [];
    const disposeGuard = installHubSuspendGuard({
      on: () => () => undefined,
      emit: (event, payload) => {
        if (event === "hub:blockers") snapshots.push(payload as { other?: string[] });
      },
    }, "layout-generation");
    const widget = deltaDefinition.createDefault("delta-main");
    const document: ProfileDocumentV3 = {
      schemaVersion: 3,
      id: "profile",
      name: "Profile",
      displayMode: "edit",
      monitorIndex: 0,
      layouts: { general: { type: "general", widgets: [widget] } },
    };

    render(
      <I18nProvider>
        <LayoutSection
          dispatch={() => undefined}
          layoutViewport={{ width: 1920, height: 1080 }}
          savedDocument={document}
          selectWidget={() => undefined}
          session="general"
          widget={widget}
          widgets={[widget]}
        />
      </I18nProvider>,
    );
    fireEvent.input(screen.getByTestId("studio-layout-x"), { target: { value: "321" } });

    expect(snapshots.at(-1)?.other).toHaveLength(1);
    disposeGuard();
  });
});
