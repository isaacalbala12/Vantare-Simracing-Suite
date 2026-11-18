interface Window {
  vantare?: {
    platform: string;
    connect(): Promise<void>;
    reviewTrust(
      ticket: string,
    ): Promise<
      import("../contract/launcher-review-bridge").LauncherReviewResult
    >;
    viewport(): { width: number; height: number };
  };
}
