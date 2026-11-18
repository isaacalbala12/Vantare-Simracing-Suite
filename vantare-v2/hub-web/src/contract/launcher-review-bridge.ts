export const launcherReviewChannel = "vantare:review-trust";
export type LauncherReviewResult =
  | "submitted"
  | "changed"
  | "expired"
  | "unavailable";

export function reviewTicket(args: readonly unknown[]): string | undefined {
  const [ticket] = args;
  return args.length === 1 &&
    typeof ticket === "string" &&
    /^[a-f0-9]{32}$/.test(ticket)
    ? ticket
    : undefined;
}

export function reviewResult(value: unknown): LauncherReviewResult {
  switch (value) {
    case "submitted":
    case "changed":
    case "expired":
      return value;
    default:
      return "unavailable";
  }
}
