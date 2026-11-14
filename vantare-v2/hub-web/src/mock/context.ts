import type {
  CoreStatus,
  DiagnosticCode,
  DiagnosticSection,
  HostToUi,
  TestingView,
  UiToHost,
} from "../contract/generated/contract";
export interface MockContext {
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
