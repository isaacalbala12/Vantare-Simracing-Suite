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
    /** The real content mounted; Main may then confirm the boot (ISA-2785). */
    mounted?(): void;
  };
}
