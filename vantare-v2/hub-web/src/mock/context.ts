import type {
  CoreStatus,
  DiagnosticCode,
  DiagnosticSection,
  HostToUi,
  TestingView,
  UiToHost,
} from "../contract/generated/contract";
export interface MockContext {
  testingData?: TestingView;
  onboarding?: {
    completed: boolean;
    settingsRevision: string;
    privacyFailed: boolean;
    privateSession: boolean;
    privateConsent: boolean;
    privacyReady: boolean;
  };
  readonly emit?: (message: HostToUi) => void;
  readonly sceneName: string;
  readonly visual: RegExpExecArray | null;
  readonly core: CoreStatus;
  readonly notes: Array<{ section: DiagnosticSection; code: DiagnosticCode }>;
  readonly note: (section: DiagnosticSection, code: DiagnosticCode) => void;
}
export type MockHandler = (message: UiToHost) => HostToUi | null | undefined;
