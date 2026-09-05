import { createContext, useContext } from "react";
import type { AccessContext } from "../../../lib/access-policy";
import type {
  ProfileDocumentV3,
  SessionLayoutType,
  SessionLayoutV3,
} from "../../../overlay/core/profile-document";
import type { AuthoringV2Scenario } from "../../../overlay/authoring/fixtures/authoring-v2-scenario-fixture";
import type { StudioCommand } from "./studio-command";
import type { StudioSaveResult } from "./studio-profile-client";

export type StudioSaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export type StudioPreviewState = {
  source: "mock" | "live";
  mockSession: AuthoringV2Scenario["session"];
  mockLocation: AuthoringV2Scenario["location"];
  zoom: "fit" | 50 | 75 | 100 | 125 | 150;
  backgroundId: string;
  safeArea: boolean;
};

export type StudioDocumentContextValue = {
  access: AccessContext;
  document: ProfileDocumentV3 | null;
  savedDocument: ProfileDocumentV3 | null;
  revision: string;
  activeLayout: SessionLayoutV3 | null;
  activeSession: SessionLayoutType;
  selectedWidgetId: string | null;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saveState: StudioSaveState;
  lastError: string | null;
  accessNotice: string | null;
  visuallyMigratedWidgetIds: readonly string[];
  dispatch(command: StudioCommand): boolean;
  selectWidget(id: string | null): void;
  selectSession(type: SessionLayoutType): void;
  save(): Promise<StudioSaveResult>;
  undo(): boolean;
  redo(): boolean;
  discardAll(): void;
  acceptRecovery(recoveredDocument: ProfileDocumentV3): void;
  dismissAccessNotice(): void;
  notifyAccessDenied(message: string): void;
};

export type StudioPreviewContextValue = {
  preview: StudioPreviewState;
  setPreview(patch: Partial<StudioPreviewState>): void;
};

export const StudioDocumentContext = createContext<StudioDocumentContextValue | null>(null);
export const StudioPreviewContext = createContext<StudioPreviewContextValue | null>(null);

export function useStudioDocument(): StudioDocumentContextValue {
  const context = useContext(StudioDocumentContext);
  if (!context) {
    throw new Error("useStudioDocument must be used inside StudioProvider");
  }
  return context;
}

export function useStudioPreview(): StudioPreviewContextValue {
  const context = useContext(StudioPreviewContext);
  if (!context) {
    throw new Error("useStudioPreview must be used inside StudioProvider");
  }
  return context;
}
