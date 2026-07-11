export type LauncherAppCategory =
  | "simulator"
  | "streaming"
  | "audio"
  | "telemetry"
  | "utility";

export type LauncherAvailability = {
  catalogued: boolean;
  found: boolean;
  installed: boolean;
  launchable: boolean;
};

export type LauncherApp = {
  id: string;
  displayName: string;
  abbreviation: string;
  category: LauncherAppCategory;
  launchMethod: "steam-uri" | "executable";
  steamAppId?: number;
  executablePath?: string;
  args?: string;
  availability: LauncherAvailability;
  pathSource?: string;
  userExecutablePath?: string;
  iconOverridePath?: string;
  isFavorite?: boolean;
  /** Deprecated wire field retained during the launcher migration. */
  detected?: boolean;
  gradientFrom: string;
  gradientTo: string;
  iconUrl?: string;
};

/** Legacy settings shape; new snapshots use LauncherApp. */
export type LauncherAppEntry = Omit<LauncherApp, "availability"> & {
  availability?: LauncherAvailability;
  detected: boolean;
};

export type LaunchStep = {
  appId: string;
  delay: number;
  argsOverride?: string;
};

export type AlreadyRunningPolicy = "ask" | "reuse" | "restart";
export type FailurePolicy = "ask" | "stop" | "continue";
export type CancelPolicy = "ask" | "leave" | "close-started";
export type ExitPolicy = "ask" | "leave" | "close-started";
export type RetryPolicy = "ask" | "failed" | "all";

export type LaunchPolicy = {
  alreadyRunning: AlreadyRunningPolicy;
  failure: FailurePolicy;
  cancel: CancelPolicy;
  exit: ExitPolicy;
  retry: RetryPolicy;
  maxRetries: number;
  firstStepDelay?: number;
};

export type LaunchProfile = {
  id: string;
  name: string;
  description?: string;
  steps: LaunchStep[];
  isFavorite?: boolean;
  notes?: string;
  launchCount?: number;
  lastLaunchedAt?: string | null;
  avgChainDurationMs?: number;
  launchOnWindowsStartup?: boolean;
  hotkey?: string;
  advanced?: boolean;
  policy?: LaunchPolicy;
};

export type LauncherActiveChain = {
  profileId: string;
  status: "running" | "done" | "error";
  startedAt?: string;
};

export type LauncherDiscovery = {
  scanning: boolean;
  lastScanAt: string | null;
  error: string | null;
};

export type LauncherSnapshot = {
  revision: number;
  apps: LauncherApp[];
  vantareProfiles: LaunchProfile[];
  userProfiles: LaunchProfile[];
  activeChains: LauncherActiveChain[];
  discovery: LauncherDiscovery;
};

export type LauncherCommandError = {
  code: string;
  message: string;
  command?: string;
  retryable?: boolean;
  details?: Record<string, string>;
};
