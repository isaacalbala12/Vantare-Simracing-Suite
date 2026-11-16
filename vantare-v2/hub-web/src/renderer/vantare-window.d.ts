interface Window {
  vantare?: {
    platform: string;
    connect(): Promise<void>;
    viewport(): { width: number; height: number };
  };
}
