import { useCallback, useEffect, useMemo, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { ProfileDocumentV3 } from "../core/profile-document";
import type { TelemetryRateCoordinator } from "../core/telemetry-rate-coordinator";
import type { EngineerPresentationStore } from "../../engineer/engineer-presentation-store";
import { useI18n } from "../../i18n/I18nProvider";
import {
  createStudioProfileClient,
  createWailsStudioEventTransport,
} from "../../hub/overlay-studio/state/studio-profile-client";
import { RuntimeOverlaySurface } from "./RuntimeOverlaySurface";
import "./in-game-overlay-editor.css";

export type InGameOverlayEditorProps = {
  document: ProfileDocumentV3;
  revision: string;
  layoutOrigin?: { x: number; y: number };
  telemetry: TelemetryRateCoordinator;
  engineerPresentations?: EngineerPresentationStore;
};

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "error"; message: string };

export function InGameOverlayEditor(props: InGameOverlayEditorProps): React.ReactElement {
  const { document, revision, layoutOrigin, telemetry, engineerPresentations } = props;
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => structuredClone(document));
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const profileClient = useMemo(
    () => createStudioProfileClient(createWailsStudioEventTransport()),
    [],
  );

  const cancel = useCallback(() => {
    Events.Emit("overlay:toggle-edit-mode");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel]);

  const updateDraft = useCallback((next: ProfileDocumentV3) => {
    setDraft(next);
    setDirty(true);
    setSaveState({ status: "idle" });
  }, []);

  const save = useCallback(async () => {
    if (!dirty || saveState.status === "saving") return;
    setSaveState({ status: "saving" });
    const result = await profileClient.save({
      document: { ...draft, displayMode: "racing" },
      expectedRevision: revision,
    });
    if (result.status !== "saved") {
      setSaveState({ status: "error", message: result.message });
      return;
    }
    setDirty(false);
    setSaveState({ status: "idle" });
    // The save callback normally refreshes the running window. Requesting the
    // canonical snapshot also covers a runtime where that refresh was skipped.
    Events.Emit("overlay:profile-v3:get");
  }, [dirty, draft, profileClient, revision, saveState.status]);

  const statusLabel = saveState.status === "saving"
    ? t("overlay.inGameEdit.saving")
    : dirty
      ? t("overlay.inGameEdit.unsaved")
      : t("overlay.inGameEdit.ready");

  return (
    <div data-testid="in-game-overlay-editor" className="in-game-overlay-editor">
      <RuntimeOverlaySurface
        document={draft}
        telemetry={telemetry}
        renderMode="desktop"
        layoutOrigin={layoutOrigin}
        engineerPresentations={engineerPresentations}
        editing={{ onDocumentChange: updateDraft }}
      />
      <div className="in-game-overlay-editor__toolbar" role="toolbar" aria-label={t("overlay.inGameEdit.title")}>
        <div className="in-game-overlay-editor__copy">
          <strong>{t("overlay.inGameEdit.title")}</strong>
          <span>{statusLabel}</span>
        </div>
        {saveState.status === "error" ? (
          <span className="in-game-overlay-editor__error" role="alert">{saveState.message}</span>
        ) : null}
        <button type="button" className="in-game-overlay-editor__button" onClick={cancel}>
          {t("overlay.inGameEdit.cancel")}
        </button>
        <button
          type="button"
          className="in-game-overlay-editor__button in-game-overlay-editor__button--primary"
          disabled={!dirty || saveState.status === "saving"}
          onClick={() => void save()}
        >
          {t("overlay.inGameEdit.save")}
        </button>
      </div>
    </div>
  );
}
