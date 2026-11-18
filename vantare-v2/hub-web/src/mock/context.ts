import type {
  CoreStatus,
  DiagnosticCode,
  DiagnosticSection,
  HostToUi,
  TestingView,
  UiToHost,
} from "../contract/generated/contract";
import type { LauncherReviewResult } from "../contract/launcher-review-bridge";
export interface MockContext {
  reviewTrust?: (ticket: string) => Promise<LauncherReviewResult>;
  studioData?: import("../contract/generated/contract").StudioView;
  settingsData?: import("../contract/generated/contract").SettingsView;
  launchForNotice?: (profile: string) => void;
  removeLauncherProfile?: (profile: string) => void;
  launcherPolicy?: (
    profile: string,
  ) => import("../contract/generated/contract").ProfilePolicy | undefined;
  testingData?: TestingView;
  launcherData?: import("../contract/generated/contract").LauncherView;
  windowsNotificationsEnabled?: boolean;
  onboarding?: {
    completed: boolean;
    settingsRevision: string;
    privacyFailed: boolean;
    privateSession: boolean;
    privateConsent: boolean;
    privacyReady: boolean;
    privacyEnabled: boolean;
  };
  readonly emit?: (message: HostToUi) => void;
  readonly sceneName: string;
  readonly visual: RegExpExecArray | null;
  readonly core: CoreStatus;
  readonly notes: Array<{ section: DiagnosticSection; code: DiagnosticCode }>;
  readonly note: (section: DiagnosticSection, code: DiagnosticCode) => void;
}
export type MockHandler = (message: UiToHost) => HostToUi | null | undefined;
