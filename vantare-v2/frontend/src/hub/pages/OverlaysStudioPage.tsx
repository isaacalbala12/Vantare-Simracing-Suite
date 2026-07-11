import { StudioRoute } from "../overlay-studio/StudioRoute";

type OverlaysStudioPageProps = {
  pendingRecommendedAutoStart?: "recommended-auto" | null;
  onAutoStartHandled?: () => void;
};

export function OverlaysStudioPage({
  pendingRecommendedAutoStart = null,
  onAutoStartHandled,
}: OverlaysStudioPageProps) {
  return (
    <StudioRoute
      pendingRecommendedAutoStart={pendingRecommendedAutoStart}
      onAutoStartHandled={onAutoStartHandled}
    />
  );
}